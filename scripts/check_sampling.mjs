/* Optional, dependency-free checks: node scripts/check_sampling.mjs.
   Also runs with Deno: deno run --allow-read scripts/check_sampling.mjs.
   DOM stubs exercise behavior only; these are not visual layout checks. */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { performance } from 'node:perf_hooks';
import { calculateStatistic, populationLocations, STATISTICS, MODE_WIDTH } from '../apps/sampling-distributions/statistics.mjs';

let checks = 0;
function assert(condition, message) { checks++; if (!condition) throw Error(message); }
function close(actual, expected, message, tolerance = 1e-9) { assert(Math.abs(actual - expected) < tolerance, `${message}: ${actual} vs ${expected}`); }
const value = (xs, statistic) => calculateStatistic(xs, statistic).value;
close(populationLocations('normal').median, 50, 'Normal median');
close(populationLocations('normal').modes[0], 50, 'Normal mode');
close(populationLocations('uniform').median, 50, 'Uniform median');
assert(populationLocations('uniform').uniform, 'Uniform has no unique mode');
close(populationLocations('right').median, 20 * Math.log(2), 'Exponential median');
close(populationLocations('right').modes[0], 0, 'Exponential mode');
close(populationLocations('left').median, 100 - 20 * Math.log(2), 'Reflected exponential median');
close(populationLocations('left').modes[0], 100, 'Reflected exponential mode');
close(populationLocations('bimodal').median, 50, 'Mixture median');
const peaks = populationLocations('bimodal').modes;
close(peaks[0], 30, 'First mixture peak', .001);
close(peaks[1], 70, 'Second mixture peak', .001);
close(peaks[0] + peaks[1], 100, 'Symmetric mixture peaks');
assert(peaks[0] > 30 && peaks[1] < 70, 'Mixture peaks account for overlapping densities');
close(populationLocations('custom', [.25, .75]).median, 50 + 50 / 3, 'Interpolate custom median');
close(populationLocations('custom', [.5, 0, 0, .5]).median, 50, 'Midpoint of median interval across gap');
assert(JSON.stringify(populationLocations('custom', [.5, 0, 0, .5]).modeRanges) === '[[0,25],[75,100]]', 'Separate custom peaks');
assert(JSON.stringify(populationLocations('custom', [1, 1, 0, 1]).modeRanges) === '[[0,50],[75,100]]', 'Merge adjacent custom peaks');
assert(JSON.stringify(populationLocations('custom', [1, 1, 1, 1]).modeRanges) === '[[0,100]]', 'Flat custom population mode range');
assert(populationLocations('custom', [0, 0, 0]) === null, 'Empty custom population locations');
close(value([1, 2, 3], 'mean'), 2, 'Mean');
close(value([12, 2, 3], 'median'), 3, 'Numeric sort and odd median');
close(value([12, 2, 3, 4], 'median'), 3.5, 'Even median');
close(value([1, 2, 3], 'populationVariance'), 2 / 3, 'N variance');
close(value([1, 2, 3], 'sampleVariance'), 1, 'N−1 variance');
close(value([1e12 + 1, 1e12 + 2, 1e12 + 3], 'sampleVariance'), 1, 'Stable shifted variance');
for (const statistic of ['mean', 'median']) close(value([7], statistic), 7, `Singleton ${statistic}`);
close(value([7], 'populationVariance'), 0, 'Singleton N variance');
assert(Number.isNaN(value([7], 'sampleVariance')), 'Singleton N−1 variance undefined');
for (const statistic of ['populationVariance', 'sampleVariance']) close(value([7, 7, 7], statistic), 0, `Constant ${statistic}`);
close(value([2.49, 2.5, 2.6], 'mode'), 3.75, 'Half-open modal bins');
close(value([-2.5, -.1, 0], 'mode'), -1.25, 'Negative modal bins');
const tied = [0, 2.5, 5];
close(calculateStatistic(tied, 'mode', () => 0).value, 1.25, 'First tied bin');
close(calculateStatistic(tied, 'mode', () => .999).value, 6.25, 'Last tied bin');
assert(calculateStatistic(tied, 'mode').tiedBins === 3, 'All-singleton tie count');

let seed = 123456789;
function random() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
const frequencies = [0, 0, 0];
for (let i = 0; i < 15000; i++) frequencies[calculateStatistic(tied, 'mode', random).modalBin]++;
frequencies.forEach(count => assert(Math.abs(count / 15000 - 1 / 3) < .02, 'Uniform tie selection'));

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; this.value = ''; this.textContent = '';
    this.clientWidth = 900; this.hidden = false; this.disabled = false; this.checked = false;
    this.classList = { toggle() {} };
  }
  append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  removeAttribute(key) { delete this.attributes[key]; }
  get previousElementSibling() { return this.parent.children[this.parent.children.indexOf(this) - 1]; }
  get selectedOptions() { return [{ textContent: this.value }]; }
  addEventListener(event, handler) { (this.events[event] ||= []).push(handler); }
  fire(type) { for (const handler of this.events[type] || []) handler({ type }); }
  click() { if (!this.disabled) this.fire('click'); }
  querySelectorAll(selector) {
    const classes = selector.split(',').map(s => s.trim().slice(1));
    return this.children.flatMap(child => [...(classes.includes(child.attributes.class) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
}
const page = readFileSync(new URL('../apps/sampling-distributions/index.qmd', import.meta.url), 'utf8');
const elements = new Map([...page.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
const $ = id => elements.get(`sampling-${id}`);
$('population').value = 'right'; $('n').value = '5'; $('statistic').value = 'mean';
$('batch').value = '1000'; $('speed').value = '5'; $('overlay').checked = true;
const context = {
  calculateStatistic, populationLocations, MODE_WIDTH, STATISTICS, performance, setTimeout, clearTimeout,
  requestAnimationFrame: callback => setTimeout(() => callback(performance.now()), 0), cancelAnimationFrame: clearTimeout,
  Math: Object.assign(Object.create(Math), { random }),
  window: { matchMedia: () => ({ matches: true }) }, ResizeObserver: class { observe() {} },
  document: { getElementById: id => elements.get(id), createElementNS: (_, tag) => new Element(tag), hidden: false, addEventListener() {} }
};
const engine = readFileSync(new URL('../apps/sampling-distributions/simulator.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/, '')
  .replace("  configure(); status('Choose a population and draw a sample to begin.');", '  globalThis.testAPI = { state, configure, makeSample, accept, reset, finishCustom, render }; configure();');
runInNewContext(engine, context);
const api = context.testAPI, state = api.state;
function settings(statistic, n = 5, population = 'normal') {
  $('statistic').value = statistic; $('n').value = String(n); $('population').value = population; api.configure();
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function idle() {
  for (let i = 0; i < 2000 && state.mode !== 'idle'; i++) await delay(2);
  assert(state.mode === 'idle', 'Work completed');
}
assert(state.count === 0 && state.statistic === 'mean', 'Initialization');
assert($('pop-stats').textContent.startsWith('μ = ') && $('pop-stats').textContent.includes(' · σ = ') && $('pop-stats').textContent.includes(' · σ² = '), 'Compact population symbols');
assert($('pop-stats').textContent.includes('Median = ') && $('pop-stats').textContent.includes('Mode = '), 'Population locations displayed');
assert(!/Population mean|Standard deviation|variance/i.test($('pop-stats').textContent), 'No full moment names in visible summary');
assert($('pop-desc').textContent.includes('Population mean') && $('pop-desc').textContent.includes('Standard deviation'), 'Accessible names retained');
settings('mean', 5, 'custom');
state.weights = Array.from({ length: 40 }, (_, i) => i % 2 ? 0 : 1);
api.configure();
assert($('pop-stats').textContent.includes('Mode = multiple ranges'), 'Long mode list summarized');
assert($('pop-stats').getAttribute('title').includes('0–2.5, 5–7.5'), 'Full mode ranges available in tooltip');
assert($('pop-desc').textContent.includes('95–97.5'), 'Full mode ranges available in graph description');
settings('sampleVariance', 1);
assert($('one').disabled && $('many').disabled && $('animate').disabled, 'N−1 buttons disabled at N=1');
$('many').click(); assert(state.count === 0, 'Undefined variance cannot sample');
settings('populationVariance', 1); $('one').click();
assert(state.count === 1 && state.latest.value === 0, 'N variance at N=1');
for (const statistic of Object.keys(STATISTICS)) {
  settings(statistic, 5); $('batch').value = '10'; $('many').click(); await idle();
  assert(state.count === 10 && state.statistics.length === 10, `${statistic}: ten samples`);
  assert(state.counts.reduce((a, b) => a + b) === 10, `${statistic}: histogram totals`);
  assert($('overlay-control').hidden === (statistic !== 'mean'), `${statistic}: approximation visibility`);
  assert($('statistics-stats').textContent.includes('Theoretical SE') === (statistic === 'mean'), `${statistic}: standard error visibility`);
  if (statistic === 'mode') assert(state.latest.tiedBins >= 1, 'Modal tie metadata');
}
settings('median', 5);
for (const x of [-1000, 0, 1000, 20000, -20000]) api.accept({ values: [x], value: x, modalBin: null, number: state.count + 1 });
assert(state.counts.reduce((a, b) => a + b) === 5, 'Rebinning preserves all results');
assert(state.statDomain[0] <= -20000 && state.statDomain[1] >= 20000, 'Statistic bounds expand');
settings('sampleVariance', 5);
assert(state.statDomain[0] === 0 && state.statDomain[1] > 100, 'Variance uses an independent nonnegative scale');
assert(!context.testAPI.state.domain.includes(state.statDomain[1]), 'Observation bounds separate');
for (const statistic of ['populationVariance', 'sampleVariance']) {
  settings(statistic, 5);
  for (let i = 0; i < 20000; i++) api.accept(api.makeSample());
  close(state.average, statistic === 'populationVariance' ? 80 : 100, `${statistic} expected value`, 3);
}
settings('mean', 5, 'custom'); state.weights.fill(0); api.finishCustom();
assert(!state.valid && $('many').disabled, 'Empty custom population disables sampling');
state.weights[10] = 1; api.finishCustom();
close(state.probabilities.reduce((a, b) => a + b), 1, 'Custom normalization');
assert(state.valid && !$('many').disabled, 'Custom distribution can sample');

for (const statistic of Object.keys(STATISTICS)) {
  settings(statistic, 200); $('batch').value = '10000';
  let beats = 0; const heartbeat = setInterval(() => { beats++; }, 1), start = performance.now();
  $('many').click(); await idle(); clearInterval(heartbeat);
  assert(state.count === 10000 && beats > 1, `${statistic}: large batch yields to event loop`);
  assert(state.statistics.every(Number.isFinite), `${statistic}: finite results`);
  console.log(`${statistic}: 10,000 samples × N=200 in ${Math.round(performance.now() - start)} ms; ${beats} event-loop heartbeats`);
}
settings('median', 200); $('many').click(); await delay(1); $('cancel').click();
const cancelled = state.count; await delay(20);
assert(state.count === cancelled && state.mode === 'idle', 'Cancel preserves completed results');
$('many').click(); $('reset').click(); await delay(20);
assert(state.count === 0 && state.mode === 'idle', 'Reset cancels stale callbacks');
$('many').click(); settings('mode', 5); await delay(20);
assert(state.count === 0 && state.statistic === 'mode', 'Statistic change cancels stale callbacks');
$('animate').click(); assert(state.mode === 'animation', 'Animation starts');
$('animate').click(); const paused = state.count; await delay(250);
assert(state.mode === 'idle' && state.count === paused, 'Animation pauses');
settings('mean', 1); $('batch').value = '10000'; $('many').click(); await idle(); $('many').click(); await idle();
assert(state.count === 20000 && $('many').disabled && $('one').disabled, '20,000-sample limit');
console.log(`Passed ${checks} sampling calculations and behavior checks; no visual layout checks performed.`);
