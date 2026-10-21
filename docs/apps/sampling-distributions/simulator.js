import { calculateStatistic, MODE_WIDTH, STATISTICS } from './statistics.mjs';
/* Independent sampling and bounded, cancellable main-thread work. No external libraries. */
(() => {
  'use strict';
  const root = document.getElementById('sampling');
  if (!root) return;
  const $ = id => document.getElementById(`sampling-${id}`);
  const NS = 'http://www.w3.org/2000/svg';
  const LIMIT = 20000, BINS = 160, CUSTOM_BINS = 40;
  const fmt = x => Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—';
  const normalDensity = (x, mu, sd) => Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
  const standardNormal = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = {
    statistic: 'mean', statDomain: [0, 140], n: 5, type: 'right', mu: 20, sigma: 20, domain: [0, 140],
    weights: Array(CUSTOM_BINS).fill(1), probabilities: [], cdf: [], valid: true,
    statistics: [], count: 0, average: 0, m2: 0, counts: new Uint32Array(BINS),
    latest: null, pending: null, mode: 'idle', generation: 0, frame: 0, timer: 0,
    drawPointer: null, lastBin: null, drawMaximum: 1
  };

  function element(tag, attrs = {}, text = '') {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  }

  // Allocate plot elements once; updates change attributes rather than rebuilding the DOM.
  function plot(id, height, barCount = 0) {
    const svg = $(id), top = 30, bottom = height - 44, left = 64, right = 880;
    const group = element('g');
    svg.append(group);
    const grids = [], xLabels = [], yLabels = [];
    for (let i = 0; i <= 4; i++) {
      const y = bottom - (bottom - top) * i / 4;
      const grid = element('line', { x1: left, x2: right, y1: y, y2: y, class: 'grid' });
      const label = element('text', { x: left - 8, y: y + 5, 'text-anchor': 'end' });
      group.append(grid, label); grids.push(grid); yLabels.push(label);
    }
    group.append(element('line', { x1: left, x2: right, y1: bottom, y2: bottom, class: 'axis' }));
    for (let i = 0; i <= 5; i++) {
      const label = element('text', { x: left + (right - left) * i / 5, y: bottom + 22, 'text-anchor': 'middle' });
      group.append(label); xLabels.push(label);
    }
    group.append(element('text', { x: (left + right) / 2, y: height - 3, 'text-anchor': 'middle' }, 'Value'));
    const yTitle = element('text', { x: left, y: 17 });
    group.append(yTitle);
    const area = element('path', { class: 'density' }); group.append(area);
    const modalBand = element('rect', { class: 'modal-bin', y: top, height: bottom - top, visibility: 'hidden' }); group.append(modalBand);
    const bars = Array.from({ length: barCount }, () => { const r = element('rect', { class: 'bar' }); group.append(r); return r; });
    const normal = element('path', { class: 'normal' }); group.append(normal);
    const mu = element('line', { class: 'mu', y1: top, y2: bottom }); group.append(mu);
    const meanLine = element('line', { class: 'sample-line', y1: top, y2: bottom, visibility: 'hidden' });
    const diamond = element('path', { class: 'sample-mean', visibility: 'hidden' });
    group.append(meanLine, diamond);
    const dots = [];
    if (id === 'sample-plot') {
      for (let i = 0; i < 200; i++) {
        const dot = element('circle', { r: 4, class: 'observation', visibility: 'hidden' });
        group.append(dot); dots.push(dot);
      }
      grids.forEach(g => g.setAttribute('visibility', 'hidden'));
    }
    return { svg, height, top, bottom, left, right, xLabels, yLabels, yTitle, area, modalBand, bars, normal, mu, meanLine, diamond, dots };
  }
  const populationPlot = plot('pop-plot', 240);
  const samplePlot = plot('sample-plot', 130);
  const distributionPlot = plot('statistics-plot', 190, BINS);
  const isVariance = () => state.statistic === 'populationVariance' || state.statistic === 'sampleVariance';
  const canSample = () => state.valid && !(state.statistic === 'sampleVariance' && state.n === 1);
  const reference = () => isVariance() ? state.sigma ** 2 : state.statistic === 'mean' ? state.mu : null;
  const domainFor = p => p === distributionPlot ? state.statDomain : state.domain;
  function xPixel(p, x) { const [lo, hi] = domainFor(p); return p.left + (x - lo) / (hi - lo) * (p.right - p.left); }
  function yPixel(p, value, max) { return p.bottom - value / max * (p.bottom - p.top); }
  function axes(p, ymax, label) {
    const width = Math.max(300, p.svg.clientWidth);
    p.svg.setAttribute('viewBox', `0 0 ${width} ${p.height}`);
    p.right = width - 20;
    const [lo, hi] = domainFor(p);
    p.xLabels.forEach((node, i) => {
      node.textContent = fmt(lo + (hi - lo) * i / 5);
      node.setAttribute('x', p.left + (p.right - p.left) * i / 5);
    });
    p.svg.querySelectorAll('.grid, .axis').forEach(node => node.setAttribute('x2', p.right));
    // The horizontal axis title is the final text node before the y-axis title.
    p.yTitle.previousElementSibling.setAttribute('x', (p.left + p.right) / 2);
    p.yTitle.previousElementSibling.textContent = p === distributionPlot ? (isVariance() ? 'Variance (squared units)' : `${STATISTICS[state.statistic]} value`) : 'Observation value';
    p.yLabels.forEach((node, i) => { node.textContent = label ? fmt(ymax * i / 4) : ''; });
    p.yTitle.textContent = label;
    const target = p === distributionPlot ? reference() : state.mu;
    p.mu.setAttribute('visibility', target === null || !state.valid ? 'hidden' : 'visible');
    if (target !== null) { p.mu.setAttribute('x1', xPixel(p, target)); p.mu.setAttribute('x2', xPixel(p, target)); }
  }
  function pathFrom(p, points, ymax, close = false) {
    let path = points.map(([x, y], i) => `${i ? 'L' : 'M'}${xPixel(p, x)},${yPixel(p, y, ymax)}`).join(' ');
    if (close) path += ` L${xPixel(p, points[points.length - 1][0])},${p.bottom} L${xPixel(p, points[0][0])},${p.bottom} Z`;
    return path;
  }

  function normalizeCustom() {
    const total = state.weights.reduce((a, b) => a + b, 0);
    state.valid = total > 0;
    state.probabilities = state.weights.map(w => total ? w / total : 0);
    let sum = 0, second = 0;
    state.mu = 0;
    const width = 100 / CUSTOM_BINS;
    state.cdf = state.probabilities.map((probability, i) => {
      const center = (i + .5) * width;
      state.mu += probability * center;
      second += probability * (center * center + width * width / 12);
      sum += probability; return sum;
    });
    if (total) state.cdf[CUSTOM_BINS - 1] = 1;
    state.sigma = Math.sqrt(Math.max(0, second - state.mu ** 2));
    $('custom-error').textContent = state.valid ? '' : 'Draw some height before sampling.';
  }
  function configure() {
    state.statistic = $('statistic').value;
    state.type = $('population').value;
    state.n = Number($('n').value);
    state.valid = true;
    let domain;
    switch (state.type) {
      case 'normal': state.mu = 50; state.sigma = 10; domain = [0, 100]; break;
      case 'uniform': state.mu = 50; state.sigma = 100 / Math.sqrt(12); domain = [0, 100]; break;
      case 'right': state.mu = 20; state.sigma = 20; domain = [0, 140]; break;
      case 'left': state.mu = 80; state.sigma = 20; domain = [-40, 100]; break;
      case 'bimodal': state.mu = 50; state.sigma = Math.sqrt(449); domain = [0, 100]; break;
      case 'custom': normalizeCustom(); domain = [0, 100]; break;
    }
    state.domain = domain;
    $('custom').hidden = state.type !== 'custom';
    populationPlot.svg.classList.toggle('drawing', state.type === 'custom');
    if (state.type === 'custom') populationPlot.svg.setAttribute('aria-describedby', 'sampling-draw-help');
    else populationPlot.svg.removeAttribute('aria-describedby');
    reset('Experiment settings changed. Results cleared.');
  }
  function populationDensity(x) {
    switch (state.type) {
      case 'normal': return normalDensity(x, 50, 10);
      case 'uniform': return x >= 0 && x <= 100 ? .01 : 0;
      case 'right': return x >= 0 ? Math.exp(-x / 20) / 20 : 0;
      case 'left': return x <= 100 ? Math.exp(-(100 - x) / 20) / 20 : 0;
      case 'bimodal': return .5 * (normalDensity(x, 30, 7) + normalDensity(x, 70, 7));
      case 'custom': return x >= 0 && x <= 100 ? (state.probabilities[Math.min(39, Math.floor(x / 2.5))] || 0) / 2.5 : 0;
    }
  }
  function drawValue() {
    switch (state.type) {
      case 'normal': return 50 + 10 * standardNormal();
      case 'uniform': return 100 * Math.random();
      case 'right': return -20 * Math.log(1 - Math.random());
      case 'left': return 100 + 20 * Math.log(1 - Math.random());
      case 'bimodal': return (Math.random() < .5 ? 30 : 70) + 7 * standardNormal();
      case 'custom': {
        const u = Math.random(); let low = 0, high = CUSTOM_BINS - 1;
        while (low < high) { const mid = (low + high) >>> 1; if (u < state.cdf[mid]) high = mid; else low = mid + 1; }
        return (low + Math.random()) * 2.5;
      }
    }
  }
  function makeSample() {
    const values = new Float64Array(state.n);
    for (let i = 0; i < state.n; i++) values[i] = drawValue();
    return { values, ...calculateStatistic(values, state.statistic), number: state.count + 1 };
  }
  function binIndex(x) { return Math.min(BINS - 1, Math.max(0, Math.floor((x - state.statDomain[0]) / (state.statDomain[1] - state.statDomain[0]) * BINS))); }
  function includeBounds(sample) {
    let low = state.domain[0], high = state.domain[1];
    sample.values.forEach(x => { low = Math.min(low, x); high = Math.max(high, x); });
    if (sample.modalBin !== null) { low = Math.min(low, sample.modalBin * MODE_WIDTH); high = Math.max(high, (sample.modalBin + 1) * MODE_WIDTH); }
    const pad = (high - low) * .03;
    state.domain = [low < state.domain[0] ? low - pad : low, high > state.domain[1] ? high + pad : high];
  }
  function includeStatistic(value) {
    const [lo, hi] = state.statDomain;
    if (value >= lo && value <= hi) return;
    const pad = Math.max(1, hi - lo) * .5;
    state.statDomain = [value < lo ? Math.min(0, value - pad) : lo, value > hi ? value + pad : hi];
    if (isVariance()) state.statDomain[0] = 0;
    state.counts.fill(0); state.statistics.forEach(x => { state.counts[binIndex(x)]++; });
  }
  function accept(sample) {
    includeBounds(sample); includeStatistic(sample.value);
    state.latest = sample;
    state.statistics.push(sample.value); state.count++; state.counts[binIndex(sample.value)]++;
    const delta = sample.value - state.average;
    state.average += delta / state.count; state.m2 += delta * (sample.value - state.average);
  }
  function renderPopulation() {
    const p = populationPlot, [lo, hi] = state.domain;
    let points;
    if (state.type === 'custom') {
      points = [[lo, 0]];
      state.probabilities.forEach((prob, i) => { points.push([i * 2.5, prob / 2.5], [(i + 1) * 2.5, prob / 2.5]); });
      points.push([hi, 0]);
    } else points = Array.from({ length: 401 }, (_, i) => { const x = lo + (hi - lo) * i / 400; return [x, populationDensity(x)]; });
    const drawingTotal = state.weights.reduce((a, b) => a + b, 0);
    const max = state.drawPointer !== null && drawingTotal > 0
      ? state.drawMaximum / (drawingTotal * 2.5)
      : Math.max(.01, ...points.map(v => v[1])) * 1.1;
    axes(p, max, 'Probability density'); p.area.setAttribute('d', pathFrom(p, points, max, true));
    $('pop-stats').textContent = state.valid ? `Population mean μ = ${fmt(state.mu)} · Standard deviation σ = ${fmt(state.sigma)} · True variance σ² = ${fmt(state.sigma ** 2)}` : 'Population has no probability mass yet.';
    $('pop-desc').textContent = `${$('population').selectedOptions[0].textContent}. ${$('pop-stats').textContent}. Dashed line marks μ. ${['normal', 'bimodal', 'left', 'right'].includes(state.type) ? 'Tails extend beyond the initial viewing window; sampled extremes expand the observation axes.' : ''}`;
  }
  function renderSample(sample = state.latest, showStatistic = true) {
    const p = samplePlot; axes(p, 1, '');
    const stacks = new Map(), positions = [];
    if (sample) sample.values.forEach(value => {
      const x = xPixel(p, value), key = Math.floor(x / 10), stack = stacks.get(key) || 0;
      stacks.set(key, stack + 1); positions.push({ x, key, stack });
    });
    p.dots.forEach((dot, i) => {
      const position = positions[i];
      dot.setAttribute('visibility', position ? 'visible' : 'hidden');
      if (!position) return;
      // Fit the entire stack into the shorter plot, including dense or large samples.
      const rows = stacks.get(position.key), radius = state.n > 100 ? 3 : 4;
      const available = p.bottom - p.top - 2 * radius - 4;
      const spacing = rows > 1 ? Math.min(10, available / (rows - 1)) : 0;
      dot.setAttribute('cx', position.x);
      dot.setAttribute('cy', p.bottom - radius - 2 - position.stack * spacing);
      dot.setAttribute('r', radius);
    });
    const mark = sample && showStatistic && !isVariance();
    p.meanLine.setAttribute('visibility', mark ? 'visible' : 'hidden');
    p.diamond.setAttribute('visibility', mark ? 'visible' : 'hidden');
    if (sample) {
      const x = xPixel(p, sample.value), y = p.top + 6;
      p.meanLine.setAttribute('x1', x); p.meanLine.setAttribute('x2', x);
      p.diamond.setAttribute('d', `M${x},${y - 7} l7,7 -7,7 -7,-7 Z`);
    }
    p.modalBand.setAttribute('visibility', mark && state.statistic === 'mode' ? 'visible' : 'hidden');
    if (mark && state.statistic === 'mode') {
      const left = xPixel(p, sample.modalBin * MODE_WIDTH);
      p.modalBand.setAttribute('x', left); p.modalBand.setAttribute('width', xPixel(p, (sample.modalBin + 1) * MODE_WIDTH) - left);
    }
    const tieNote = sample && state.statistic === 'mode' && showStatistic
      ? ` · ${sample.tiedBins} highest-count bin${sample.tiedBins === 1 ? '' : 's'} (${sample.modalCount} observation${sample.modalCount === 1 ? '' : 's'} each)${sample.tiedBins > 1 ? '; one selected at random' : ''}` : '';
    $('sample-stats').textContent = sample ? `Sample ${fmt(sample.number)} · N = ${state.n}${showStatistic ? ` · ${STATISTICS[state.statistic]} = ${fmt(sample.value)}${isVariance() ? ' squared units' : ''}` : ' · First, look at the individual observations.'}${tieNote}` : 'No sample drawn yet.';
    $('sample-desc').textContent = $('sample-stats').textContent + ' Dots show observations; vertical stacking has no numerical meaning. Dashed line marks the population mean.';
  }
  function renderDistribution() {
    const p = distributionPlot, width = (state.statDomain[1] - state.statDomain[0]) / BINS, se = state.sigma / Math.sqrt(state.n);
    const densities = Array.from(state.counts, count => state.count ? count / (state.count * width) : 0);
    const overlay = state.statistic === 'mean' && $('overlay').checked && state.valid;
    const ymax = Math.max(.01, ...densities, overlay ? normalDensity(state.mu, state.mu, se) : 0) * 1.1;
    axes(p, ymax, 'Probability density');
    p.bars.forEach((bar, i) => {
      const x = p.left + (p.right - p.left) * i / BINS, y = yPixel(p, densities[i], ymax);
      bar.setAttribute('x', x); bar.setAttribute('y', y); bar.setAttribute('width', (p.right - p.left) / BINS - 1); bar.setAttribute('height', p.bottom - y);
    });
    // Sample the curve relative to its standard error so narrow peaks remain accurate at large n.
    const points = Array.from({ length: 301 }, (_, i) => {
      const x = Math.max(state.statDomain[0], Math.min(state.statDomain[1], state.mu + (i / 300 * 10 - 5) * se));
      return [x, normalDensity(x, state.mu, se)];
    });
    p.normal.setAttribute('d', overlay ? pathFrom(p, points, ymax) : '');
    $('statistics-stats').textContent = `Samples = ${fmt(state.count)} · Mean of statistics = ${state.count ? fmt(state.average) : '—'} · SD of statistics = ${state.count > 1 ? fmt(Math.sqrt(state.m2 / (state.count - 1))) : '—'}${state.statistic === 'mean' ? ` · Theoretical SE = ${state.valid ? fmt(se) : '—'}` : ''}`;
    $('statistics-desc').textContent = $('statistics-stats').textContent + `. Each entry is one ${STATISTICS[state.statistic]} from ${state.n} independent observations. ${overlay ? 'Purple curve shows the theoretical normal approximation for means.' : ''}`;
  }
  function render() {
    const name = STATISTICS[state.statistic];
    $('flow').textContent = `Population → Random Sample → Sampling Distribution of ${name}`;
    $('heading-statistics').textContent = `3. Sampling Distribution: ${name}`;
    $('statistic-connector').textContent = `↓ Add one ${name.toLowerCase()} from this sample to the distribution below`;
    $('sample-help').textContent = isVariance()
      ? 'Dots show observations; variance is displayed in squared units above the plot. The dashed line marks μ.'
      : 'Each dot is one observation; the orange diamond marks the selected statistic. Dashed line: population mean μ.';
    $('overlay-control').hidden = state.statistic !== 'mean';
    $('legend').textContent = state.statistic === 'mean'
      ? `Dashed line: population mean μ${$('overlay').checked ? ' · Purple curve: normal approximation' : ''}`
      : isVariance() ? `Dashed line: true population variance σ² = ${state.valid ? fmt(state.sigma ** 2) : '—'} (squared units)` : '';
    const instructions = {
      mean: 'Mean = sum of observations / N. One sample contributes one mean.',
      median: 'Median = middle sorted observation, or average of the two middle observations for even N.',
      mode: 'Histogram mode: fixed bin width 2.5, boundaries at multiples of 2.5. Report the winning bin midpoint; choose uniformly at random among tied bins.',
      populationVariance: `Population variance formula: Σ(xᵢ−x̄)²/N. Its expectation is (N−1)σ²/N = ${state.valid ? fmt((state.n - 1) / state.n * state.sigma ** 2) : '—'}; the generating population variance is σ².`,
      sampleVariance: state.n === 1 ? 'Sample variance is undefined at N = 1. Increase sample size to at least 2 to sample.' : 'Sample variance formula: Σ(xᵢ−x̄)²/(N−1). Under independent sampling, its expectation is the true population variance σ².'
    };
    $('statistic-help').textContent = instructions[state.statistic];
    renderPopulation(); renderSample(); renderDistribution();
  }
  function status(message) { $('status').textContent = message; }
  function controls() {
    const busy = state.mode !== 'idle', blocked = !canSample() || state.count >= LIMIT || state.drawPointer !== null;
    $('one').disabled = blocked || busy; $('many').disabled = blocked || busy;
    $('animate').disabled = blocked || (busy && state.mode !== 'animation');
    $('animate').textContent = state.mode === 'animation' ? 'Pause animation' : 'Start animation';
    $('cancel').hidden = state.mode !== 'batch'; $('progress').hidden = state.mode !== 'batch';
    $('batch').disabled = busy;
  }
  function stop(message) {
    state.generation++; cancelAnimationFrame(state.frame); clearTimeout(state.timer);
    // Preserve the displayed sample when pausing a conceptual demonstration mid-step.
    if (state.pending) { accept(state.pending); state.pending = null; }
    state.mode = 'idle'; controls(); render(); if (message) status(message);
  }
  function reset(message = 'Results cleared. Draw a new sample to begin.') {
    state.generation++; cancelAnimationFrame(state.frame); clearTimeout(state.timer);
    state.pending = null; state.mode = 'idle';
    state.statistics = []; state.count = 0; state.average = 0; state.m2 = 0; state.counts.fill(0); state.latest = null;
    state.statDomain = isVariance() ? [0, Math.max(1, state.sigma ** 2 * 3)] : state.domain.slice();
    render(); controls(); status(!canSample() && state.valid ? 'Sample variance is undefined at N = 1. Choose N ≥ 2.' : message);
  }
  function reachedLimit() { return state.count >= LIMIT; }
  function demonstrate(repeat) {
    if (!canSample() || reachedLimit()) return;
    state.mode = repeat ? 'animation' : 'single'; controls();
    const generation = state.generation;
    const step = () => {
      if (generation !== state.generation) return;
      const sample = makeSample(); includeBounds(sample); state.pending = sample;
      const interval = 1000 / Number($('speed').value);
      const commit = () => {
        if (generation !== state.generation) return;
        accept(sample); state.pending = null; render();
        if (reachedLimit()) { stop('20,000-sample limit reached. Reset results to start again.'); return; }
        if (repeat) state.timer = setTimeout(step, reducedMotion.matches ? interval : interval * .4);
        else { state.mode = 'idle'; controls(); status(`Sample ${fmt(state.count)}: its ${STATISTICS[state.statistic].toLowerCase()}, ${fmt(sample.value)}, is now one entry in the sampling distribution.`); }
      };
      if (reducedMotion.matches) { commit(); return; }
      renderPopulation(); renderSample(sample, false);
      if (!repeat) status('Individual observations → selected statistic → one entry in the sampling distribution.');
      state.timer = setTimeout(() => {
        if (generation !== state.generation) return;
        renderSample(sample, true);
        state.timer = setTimeout(commit, interval * .3);
      }, interval * .3);
    };
    if (repeat) status('Animation running: each sample contributes one statistic.');
    step();
  }
  function batch() {
    if (!canSample() || reachedLimit() || state.mode !== 'idle') return;
    state.mode = 'batch'; const generation = ++state.generation;
    const startCount = state.count, target = Math.min(LIMIT, startCount + Number($('batch').value));
    let lastPaint = -Infinity, lastAnnouncement = -Infinity;
    $('progress').max = target - startCount; $('progress').value = 0;
    controls(); status('Calculating samples in batches…');
    function chunk(now) {
      if (generation !== state.generation) return;
      const deadline = performance.now() + 8;
      do {
        accept(makeSample());
      } while (state.count < target && performance.now() < deadline);
      const complete = state.count >= target;
      if (complete || now - lastPaint >= 100) {
        render(); $('progress').value = state.count - startCount; lastPaint = now;
      }
      if (now - lastAnnouncement >= 1000) { status(`Batch progress: ${fmt(state.count - startCount)} of ${fmt(target - startCount)} samples.`); lastAnnouncement = now; }
      if (complete) {
        state.mode = 'idle'; controls();
        status(`Added ${fmt(state.count - startCount)} samples without individual animations.${reachedLimit() ? ' 20,000-sample limit reached. Reset results to start again.' : ''}`);
      } else state.frame = requestAnimationFrame(chunk);
    }
    state.frame = requestAnimationFrame(chunk);
  }

  // Drawing modifies relative bin heights; smoothing and normalization occur on completion.
  function finishCustom() {
    const old = state.weights;
    state.weights = old.map((w, i) => ((old[i - 1] ?? w) + 2 * w + (old[i + 1] ?? w)) / 4);
    normalizeCustom(); reset('Custom population updated and normalized. Results cleared.');
  }
  function drawAt(event) {
    const p = populationPlot, point = p.svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const matrix = p.svg.getScreenCTM(); if (!matrix) return;
    const local = point.matrixTransform(matrix.inverse());
    const x = Math.max(0, Math.min(1, (local.x - p.left) / (p.right - p.left)));
    const bin = Math.min(CUSTOM_BINS - 1, Math.floor(x * CUSTOM_BINS));
    const height = Math.max(0, Math.min(1, (p.bottom - local.y) / (p.bottom - p.top))) * state.drawMaximum;
    if (state.lastBin !== null && state.lastBin !== bin) {
      const previous = state.weights[state.lastBin], distance = Math.abs(bin - state.lastBin);
      for (let j = 1; j <= distance; j++) state.weights[state.lastBin + Math.sign(bin - state.lastBin) * j] = previous + (height - previous) * j / distance;
    } else state.weights[bin] = height;
    state.lastBin = bin; normalizeCustom(); renderPopulation();
  }
  populationPlot.svg.addEventListener('pointerdown', event => {
    if (state.type !== 'custom' || state.drawPointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); reset('Drawing a custom population…');
    state.drawPointer = event.pointerId; state.lastBin = null; state.drawMaximum = Math.max(1, ...state.weights) * 1.1;
    populationPlot.svg.setPointerCapture(event.pointerId); controls(); drawAt(event);
  });
  populationPlot.svg.addEventListener('pointermove', event => { if (event.pointerId === state.drawPointer) drawAt(event); });
  function endDrawing(event) {
    if (event.pointerId !== state.drawPointer) return;
    state.drawPointer = null; state.lastBin = null; finishCustom();
  }
  populationPlot.svg.addEventListener('pointerup', endDrawing);
  populationPlot.svg.addEventListener('pointercancel', endDrawing);
  populationPlot.svg.addEventListener('lostpointercapture', endDrawing);
  $('clear').addEventListener('click', () => { state.weights.fill(0); finishCustom(); });
  $('population').addEventListener('change', configure);
  $('statistic').addEventListener('change', configure);
  $('n').addEventListener('change', () => {
    const value = Number($('n').value);
    if (!Number.isInteger(value) || value < 1 || value > 200) {
      $('n').value = String(state.n); status('Sample size must be a whole number from 1 to 200. Previous sample size retained.'); return;
    }
    configure();
  });
  $('one').addEventListener('click', () => demonstrate(false));
  $('many').addEventListener('click', batch);
  $('animate').addEventListener('click', () => state.mode === 'animation' ? stop('Animation paused. Completed samples retained.') : demonstrate(true));
  $('cancel').addEventListener('click', () => stop('Batch cancelled. Completed samples retained.'));
  $('reset').addEventListener('click', () => reset());
  $('overlay').addEventListener('change', render);
  new ResizeObserver(() => render()).observe(root);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode !== 'idle') stop('Sampling paused because the page was hidden. Completed samples retained.');
  });
  configure(); status('Choose a population and draw a sample to begin.');
})();
