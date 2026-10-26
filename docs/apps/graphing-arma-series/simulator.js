import { N, BURN_IN, LAGS, BOUND, coefficients, modelInfo, whiteNoise, simulate, correlations, exerciseModel, modelName, explanation, exerciseFeedback } from './statistics.mjs';

const root = document.getElementById('arma');
if (root) {
  const $ = id => document.getElementById(`arma-${id}`);
  const fields = ['ar1', 'ar2', 'ar3', 'ma1', 'ma2', 'ma3'].map($);
  const state = { mode: 'explore', errors: whiteNoise(), applied: null, exploration: null, quiz: null, revealed: false, noiseNumber: 1 };
  const NS = 'http://www.w3.org/2000/svg';
  const fmt = x => Math.abs(x) >= 1e5 || (x !== 0 && Math.abs(x) < .001) ? x.toExponential(2) : x.toLocaleString(undefined, { maximumFractionDigits: 3 });
  const showMessage = (id, text) => { $(id).textContent = text; $(id).hidden = !text; };

  function equation(ar, ma) {
    const lag = i => ['₁', '₂', '₃'][i];
    const term = (x, variable, i) => x === 0 ? '' : ` ${x < 0 ? '−' : '+'} ${Math.abs(x)}${variable}ₜ₋${lag(i)}`;
    // Keep entered coefficient precision, and omit inactive zero terms.
    return `yₜ = εₜ${ar.map((x, i) => term(x, 'y', i)).join('')}${ma.map((x, i) => term(x, 'ε', i)).join('')}`;
  }

  function conditionNotice(info) {
    const messages = [];
    if (!info.stationary) messages.push('Nonstationary AR coefficients (including a unit-root boundary): the usual stationary ACF/PACF identification rules do not apply. This path starts from zero and shows the first 200 observations, without the 2,000-observation burn-in.');
    if (!info.invertible) messages.push('Noninvertible MA coefficients (including a unit-root boundary): sample ACF and PACF are still displayed, but the usual invertible-model identification assumptions are not satisfied.');
    return messages.join(' ');
  }

  function result(ar, ma, errors) {
    const simulation = simulate(ar, ma, errors);
    return { ...simulation, ...correlations(simulation.values), ar: [...ar], ma: [...ma] };
  }

  function pending() {
    if (!state.applied) return;
    $('pending').hidden = fields.every((field, i) => {
      try { return (coefficients([field.value, '0', '0'])[0] || 0) === (i < 3 ? state.applied.ar[i] || 0 : state.applied.ma[i - 3] || 0); }
      catch { return false; }
    });
  }

  function readCoefficients() {
    const parsed = [];
    const messages = [];
    fields.forEach((field, i) => {
      try {
        const value = coefficients([field.value, '0', '0'])[0] || 0;
        parsed.push(value);
        field.removeAttribute('aria-invalid');
        field.setAttribute('aria-describedby', 'arma-input-help');
      } catch {
        parsed.push(0);
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute('aria-describedby', 'arma-input-help arma-input-error');
        messages.push(`${i < 3 ? 'AR' : 'MA'} lag ${i % 3 + 1}: enter a finite number; use 0 for an unused lag.`);
      }
    });
    if (messages.length) {
      showMessage('input-error', `${messages.join(' ')} Previous plots are unchanged.`);
      fields.find(field => field.getAttribute('aria-invalid') === 'true').focus();
      return null;
    }
    return { ar: coefficients(parsed.slice(0, 3)), ma: coefficients(parsed.slice(3)) };
  }

  function applyModel() {
    const model = readCoefficients();
    if (!model) return;
    showMessage('info', conditionNotice(modelInfo(model.ar, model.ma)));
    try {
      const next = result(model.ar, model.ma, state.errors);
      state.applied = model;
      state.exploration = next;
      showMessage('input-error', '');
      pending();
      $('status').textContent = `Plots updated. White-noise realization ${state.noiseNumber}.`;
      render();
    } catch (error) {
      showMessage('input-error', `${error.message} The plots below still show the previous model.`);
      $('status').textContent = 'Previous result retained — the requested model could not be graphed.';
    }
  }

  function newNoise() {
    const errors = whiteNoise();
    const { ar, ma } = state.applied;
    showMessage('info', conditionNotice(modelInfo(ar, ma)));
    try {
      const next = result(ar, ma, errors);
      state.errors = errors;
      state.exploration = next;
      state.noiseNumber++;
      showMessage('input-error', fields.some(field => field.getAttribute('aria-invalid') === 'true') ? 'Highlighted coefficient edits remain unapplied. Enter a finite number in each highlighted field, then press Graph it.' : '');
      $('status').textContent = `New white noise applied to the graphed model. Realization ${state.noiseNumber}.`;
      pending();
      render();
    } catch (error) {
      showMessage('input-error', `${error.message} Previous errors and plots are unchanged.`);
      $('status').textContent = 'Previous result retained — the new simulation could not be graphed.';
    }
  }

  function newExercise() {
    const { ar, ma } = exerciseModel();
    state.quiz = result(ar, ma, whiteNoise());
    state.revealed = false;
    $('guess-p').value = '';
    $('guess-q').value = '';
    $('undecided').checked = false;
    $('guess-p').disabled = $('guess-q').disabled = false;
    $('feedback').removeAttribute('data-order-match');
    showMessage('feedback', '');
    showMessage('guess-error', '');
    $('status').textContent = 'New exercise. The generating model is hidden until you check or reveal it.';
    render();
  }

  function setMode(mode) {
    state.mode = mode;
    const explore = mode === 'explore';
    $('explore').hidden = !explore;
    $('exercise').hidden = explore;
    $('explore-mode').setAttribute('aria-pressed', String(explore));
    $('exercise-mode').setAttribute('aria-pressed', String(!explore));
    if (!explore && !state.quiz) newExercise();
    else {
      $('status').textContent = explore ? `Exploration restored. White-noise realization ${state.noiseNumber}.` : state.revealed ? 'Exercise restored with its generating model revealed.' : 'Exercise restored. The generating model is hidden.';
      render();
    }
  }

  function checkAnswer() {
    $('feedback').removeAttribute('data-order-match');
    const undecided = $('undecided').checked;
    if (!undecided && ($('guess-p').value === '' || $('guess-q').value === '')) {
      showMessage('guess-error', 'Choose both p and q, or select Cannot decide.');
      return;
    }
    const { p, q } = state.quiz;
    $('feedback').setAttribute('data-order-match', String(!undecided && Number($('guess-p').value) === p && Number($('guess-q').value) === q));
    showMessage('guess-error', '');
    showMessage('feedback', exerciseFeedback(p, q, Number($('guess-p').value), Number($('guess-q').value), undecided));
    state.revealed = true;
    $('status').textContent = 'Answer checked. The generating model is revealed below.';
    render();
  }

  function svgElement(tag, attrs = {}, text = '') {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text) node.textContent = text;
    return node;
  }

  function draw(id, values, isCorrelation) {
    const svg = $(id);
    // Re-render only the graphics group; retain accessible title and description.
    svg.querySelector('g')?.remove();
    const width = Math.max(280, svg.clientWidth || 600), height = isCorrelation ? 275 : 285;
    const left = 64, right = width - 16, top = 24, bottom = height - 48;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const g = svgElement('g');
    svg.append(g);
    const magnitude = Math.max(...Array.from(values, Math.abs)) || 1;
    const normalized = isCorrelation ? Array.from(values) : Array.from(values, x => x / magnitude);
    const limit = Number.MAX_VALUE / magnitude;
    const lo = isCorrelation ? -1 : Math.max(-limit, Math.min(0, ...normalized) - .08);
    const hi = isCorrelation ? 1 : Math.min(limit, Math.max(0, ...normalized) + .08);
    const y = value => bottom - (value - lo) / (hi - lo) * (bottom - top);
    const x = index => left + (right - left) * (isCorrelation ? (index + 1) / (LAGS + 1) : index / (N - 1));
    const horizontal = (value, className) => g.append(svgElement('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: className }));
    for (let i = 0; i <= 4; i++) {
      const value = lo + (hi - lo) * i / 4;
      horizontal(value, 'grid');
      g.append(svgElement('text', { x: left - 7, y: y(value) + 4, 'text-anchor': 'end' }, fmt(isCorrelation ? value : value * magnitude)));
    }
    horizontal(0, isCorrelation ? 'axis' : 'reference');
    g.append(svgElement('line', { x1: left, x2: right, y1: bottom, y2: bottom, class: 'axis' }));
    if (isCorrelation) {
      horizontal(BOUND, 'reference'); horizontal(-BOUND, 'reference');
      normalized.forEach((value, i) => {
        const stem = svgElement('line', { x1: x(i), x2: x(i), y1: y(0), y2: y(value), class: 'stem' });
        stem.append(svgElement('title', {}, `Lag ${i + 1}: ${fmt(value)}`));
        g.append(stem);
      });
      // Thin tick labels on narrow screens, but always draw every lag's stem.
      for (let k = 1; k <= LAGS; k++) if (width > 420 || k === 1 || k % 3 === 0) g.append(svgElement('text', { x: x(k - 1), y: bottom + 20, 'text-anchor': 'middle' }, String(k)));
      g.append(svgElement('text', { x: left, y: 14 }, 'Correlation'));
      $(id + '-desc').textContent = `Sample ${id === 'acf' ? 'autocorrelations' : 'partial autocorrelations'} for lags 1 through 15. Dashed reference bounds at plus and minus ${fmt(BOUND)}. ${values.map((value, i) => `Lag ${i + 1}: ${fmt(value)}`).join('; ')}.`;
    } else {
      g.append(svgElement('path', { d: normalized.map((value, i) => `${i ? 'L' : 'M'}${x(i)},${y(value)}`).join(' '), class: 'series' }));
      for (const k of [1, 50, 100, 150, 200]) g.append(svgElement('text', { x: x(k - 1), y: bottom + 20, 'text-anchor': 'middle' }, String(k)));
      g.append(svgElement('text', { x: left, y: 14 }, 'yₜ'));
      $('time-desc').textContent = `200 simulated observations. Minimum ${fmt(Math.min(...values))}; maximum ${fmt(Math.max(...values))}. The dashed line marks zero.`;
    }
    g.append(svgElement('text', { x: (left + right) / 2, y: height - 6, 'text-anchor': 'middle' }, isCorrelation ? 'Lag' : 'Observation'));
  }

  function render() {
    const explore = state.mode === 'explore';
    const data = explore ? state.exploration : state.quiz;
    if (!data) return;
    const visible = explore || state.revealed;
    $('model').hidden = !visible;
    // Clear hidden answers too, so old exploration labels do not remain in the DOM.
    $('model-name').textContent = visible ? modelName(data.p, data.q) : '';
    $('equation').textContent = visible ? equation(data.ar, data.ma) : '';
    $('guidance').hidden = !visible;
    $('guidance').textContent = visible ? data.stationary && data.invertible ? explanation(data.p, data.q) : 'The sample ACF and PACF describe this simulated path. The standard identification table assumes stationarity and invertibility; use care with these coefficients.' : '';
    $('settings').textContent = `${N} observations · Gaussian errors with mean 0 and variance 4 · ${data.burn === BURN_IN ? '2,000 preliminary observations discarded' : 'Zero initial values; no burn-in because the AR coefficients are nonstationary'}`;
    draw('time', data.values, false);
    draw('acf', data.acf, true);
    draw('pacf', data.pacf, true);
  }

  $('form').addEventListener('submit', event => { event.preventDefault(); applyModel(); });
  fields.forEach(field => field.addEventListener('input', pending));
  $('new-noise').addEventListener('click', newNoise);
  $('explore-mode').addEventListener('click', () => setMode('explore'));
  $('exercise-mode').addEventListener('click', () => setMode('exercise'));
  $('new-exercise').addEventListener('click', newExercise);
  $('guess-form').addEventListener('submit', event => { event.preventDefault(); checkAnswer(); });
  $('undecided').addEventListener('change', () => { $('guess-p').disabled = $('guess-q').disabled = $('undecided').checked; });
  $('reveal').addEventListener('click', () => {
    $('feedback').removeAttribute('data-order-match');
    state.revealed = true;
    showMessage('guess-error', '');
    showMessage('feedback', explanation(state.quiz.p, state.quiz.q));
    $('status').textContent = 'The generating model is revealed below.';
    render();
  });
  // A resize redraws existing results; it never generates data or correlations.
  let resizeFrame;
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(render);
  }).observe($('time'));
  applyModel();
}
