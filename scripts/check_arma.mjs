/* Dependency-free checks:
   node scripts/check_arma.mjs
   or: deno run --allow-read --allow-env --allow-run=Rscript scripts/check_arma.mjs
   Uses base R as an independent numerical reference. DOM stubs are not a visual browser test. */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import * as core from '../apps/graphing-arma-series/statistics.mjs';

let checks = 0;
function assert(ok, message) { checks++; if (!ok) throw Error(message); }
function close(actual, expected, message, tolerance = 1e-10) {
  assert(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${message}: ${actual} vs ${expected}`);
}
function throws(fn, message) { let threw = false; try { fn(); } catch { threw = true; } assert(threw, message); }
const reference = spawnSync('Rscript', [new URL('./check_arma_reference.R', import.meta.url).pathname], { encoding: 'utf8' });
assert(reference.status === 0, `R reference failed: ${reference.stderr || reference.error || ''}`);
const cases = JSON.parse(reference.stdout);
const errors = Float64Array.from({ length: 2200 }, (_, i) => 2 * Math.sin((i + 1) * Math.sqrt(2)) + Math.cos((i + 1) * Math.sqrt(3)));
for (const [index, reference] of cases.entries()) {
  const data = core.simulate(reference.ar, reference.ma, errors);
  const correlations = core.correlations(data.values);
  assert(data.stationary === reference.stationary && data.invertible === reference.invertible, `Polynomial classification ${index}`);
  assert(data.burn === (reference.stationary ? 2000 : 0), `Burn-in ${index}`);
  data.values.forEach((value, j) => close(value, reference.values[j], `Recursion ${index}, observation ${j}`));
  for (const key of ['acf', 'pacf']) correlations[key].forEach((value, j) => close(value, reference[key][j], `${key} ${index}, lag ${j + 1}`));
}
assert(core.coefficients(['0', '0', '0']).length === 0, 'All zeros imply order zero');
assert(core.coefficients(['0', '0', '.5']).length === 3, 'Interior zeros retain highest lag');
assert(core.coefficients(['.5', '0', '0']).length === 1, 'Trailing zeros reduce order');
for (const value of ['', ' ', 'Infinity', 'NaN', '0x10', '1abc', '1,2', '1e999']) throws(() => core.coefficients([value, '0', '0']), `Reject ${JSON.stringify(value)}`);
close(core.coefficients([' -2e-1 ', '0', '0'])[0], -.2, 'Signed scientific input');
throws(() => core.correlations(new Float64Array(200)), 'Constant-series correlations undefined');
throws(() => core.simulate([1e308], [], errors), 'Explosive overflow is reported');
const large = Float64Array.from({ length: 200 }, (_, i) => (i % 2 ? 1 : -1) * 1e308);
assert(Object.values(core.correlations(large)).flat().every(Number.isFinite), 'Scaled correlations remain finite at extreme magnitudes');
function selectExercise(...draws) {
  return core.exerciseModel(() => {
    assert(draws.length > 0, 'Exercise uses expected random draws');
    return draws.shift();
  });
}
const familyOf = model => model.ar.length ? model.ma.length ? 'arma' : 'ar' : model.ma.length ? 'ma' : 'white';
for (const [draw, family] of [[0, 'ar'], [.4 - 1e-12, 'ar'], [.4, 'ma'], [.8 - 1e-12, 'ma'], [.8, 'arma'], [.9 - 1e-12, 'arma'], [.9, 'white'], [1 - 1e-12, 'white']]) {
  assert(familyOf(selectExercise(draw, .5, .5)) === family, `Family probability boundary ${draw}`);
}
for (let p = 0; p <= 3; p++) for (let q = 0; q <= 3; q++) {
  const arDraw = (p - .5) / 3, maDraw = (q - .5) / 3;
  const model = p && q ? selectExercise(.85, arDraw, maDraw) : p ? selectExercise(.2, arDraw) : q ? selectExercise(.6, maDraw) : selectExercise(.95);
  const info = core.modelInfo(model.ar, model.ma);
  assert(info.p === p && info.q === q && info.stationary && info.invertible, `Exercise (${p},${q}) valid and selectable`);
  assert(model.ar.every(x => Math.abs(x) > .4) && model.ma.every(x => Math.abs(x) > .25), `Exercise (${p},${q}) strictly meets magnitude thresholds`);
  const reference = cases[p * 4 + q];
  assert(JSON.stringify(model.ar) === JSON.stringify(reference.ar) && JSON.stringify(model.ma) === JSON.stringify(reference.ma), 'Exercise matches independently checked R coefficients');
  if (p && q) assert(core.exerciseFeedback(p, q, p, q, false).includes('do not establish them uniquely'), 'Exact ARMA match retains uncertainty');
}
assert(core.exerciseFeedback(1, 1, 0, 0, true).includes('supported inference'), 'Cannot decide supported for ARMA');
assert(core.exerciseFeedback(1, 0, 1, 0, false).includes('match the generator'), 'Pure AR matching feedback');

let seed = 123456789, draws = 0;
function random() { draws++; seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
const families = { ar: 0, ma: 0, arma: 0, white: 0 }, orders = Array(16).fill(0), trials = 100000;
for (let i = 0; i < trials; i++) {
  const model = core.exerciseModel(random);
  families[familyOf(model)]++;
  orders[model.ar.length * 4 + model.ma.length]++;
}
for (const [family, expected] of Object.entries({ ar: .4, ma: .4, arma: .1, white: .1 })) close(families[family] / trials, expected, `${family} selection frequency`, .005);
for (let p = 0; p <= 3; p++) for (let q = 0; q <= 3; q++) {
  const expected = p && q ? .1 / 9 : p || q ? .4 / 3 : .1;
  close(orders[p * 4 + q] / trials, expected, `Uniform within-family order (${p},${q})`, .003);
}
const noise = core.whiteNoise(random);
assert(noise.length === 2200 && noise.every(Number.isFinite), 'Finite shared Gaussian innovations');
const repeatA = core.simulate([.7], [], noise), repeatB = core.simulate([.7], [], noise);
assert(repeatA.values.every((x, i) => x === repeatB.values[i]), 'Shared errors reproduce identical path');
const pooled = Array.from({ length: 100 }, () => Array.from(core.whiteNoise(random))).flat();
const mean = pooled.reduce((a, b) => a + b, 0) / pooled.length;
const variance = pooled.reduce((a, b) => a + (b - mean) ** 2, 0) / pooled.length;
close(mean, 0, 'Gaussian mean', .025); close(variance, 4, 'Gaussian variance', .06);

class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; this.value = ''; this.textContent = ''; this.clientWidth = 650; this.hidden = false; this.disabled = false; this.checked = false; }
  append(...nodes) { nodes.forEach(node => { node.parent = this; this.children.push(node); }); }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
  fire(type) { for (const callback of this.events[type] || []) callback({ preventDefault() {} }); }
  click() { if (!this.disabled) this.fire('click'); }
  focus() { this.focused = true; }
  querySelector(tag) { return this.children.find(node => node.tag === tag) || this.children.map(node => node.querySelector(tag)).find(Boolean); }
}
const page = readFileSync(new URL('../apps/graphing-arma-series/index.qmd', import.meta.url), 'utf8');
const elements = new Map([...page.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
const $ = id => elements.get(`arma-${id}`);
for (const row of ['ar', 'ma']) for (let lag = 1; lag <= 3; lag++) $(`${row}${lag}`).value = '0';
const context = {
  ...core, whiteNoise: () => core.whiteNoise(random), exerciseModel: () => core.exerciseModel(random),
  requestAnimationFrame: callback => { callback(); return 1; }, cancelAnimationFrame() {},
  ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() {} },
  document: { getElementById: id => elements.get(id), createElementNS: (_, tag) => new Element(tag) }
};
const source = readFileSync(new URL('../apps/graphing-arma-series/simulator.js', import.meta.url), 'utf8').replace(/^import .*;\n/, '');
runInNewContext(source, context);
const path = () => $('time').querySelector('path').getAttribute('d');
const initial = path(), initialDraws = draws;
assert($('model-name').textContent.includes('White noise'), 'Initial white-noise example');
$('ar1').value = '.7'; $('ar1').fire('input');
assert(path() === initial && draws === initialDraws && !$('pending').hidden, 'Typing leaves series and innovations unchanged');
$('form').fire('submit'); const arPath = path();
assert(arPath !== initial && draws === initialDraws && $('pending').hidden, 'Graph it applies model using shared errors');
$('form').fire('submit'); assert(path() === arPath, 'Repeated Graph it is reproducible');
$('ar1').value = '.2'; $('ar1').fire('input'); $('new-noise').click();
assert(draws > initialDraws && path() !== arPath && !$('pending').hidden, 'New white noise redraws applied model with pending edits retained');
assert($('equation').textContent.includes('0.7y'), 'New noise does not apply pending coefficients');
$('ar1').value = 'bad'; $('form').fire('submit'); const previous = path();
assert(!$('input-error').hidden && $('ar1').getAttribute('aria-invalid') === 'true' && $('ar1').focused, 'Field-specific invalid-input feedback');
assert(path() === previous, 'Invalid input retains plots');
$('new-noise').click();
assert(!$('input-error').hidden && $('input-error').textContent.includes('remain unapplied') && !$('pending').hidden, 'New noise retains useful validation feedback for pending invalid edits');
$('ar1').value = '1'; $('form').fire('submit');
assert(!$('info').hidden && $('info').textContent.includes('Nonstationary') && $('settings').textContent.includes('no burn-in'), 'Unit root graphs with notice and zero-start exception');
$('ar1').value = '0'; $('ma1').value = '2'; $('form').fire('submit');
assert(!$('info').hidden && $('info').textContent.includes('Noninvertible'), 'Noninvertible MA graphs');
$('ar1').value = '1'; $('form').fire('submit');
assert($('info').textContent.includes('Nonstationary') && $('info').textContent.includes('Noninvertible'), 'Both notices displayed');
$('ar1').value = '1e308'; const beforeOverflow = path(); $('form').fire('submit');
assert(path() === beforeOverflow && $('status').textContent.includes('Previous result'), 'Overflow retains and labels old plots');
$('ar1').value = '0'; $('ma1').value = '0'; $('form').fire('submit');
assert($('info').hidden && $('input-error').hidden, 'Notices clear after valid stationary invertible model');
const exploration = path();
$('exercise-mode').click();
assert($('explore').hidden && !$('exercise').hidden && $('model').hidden && !$('model-name').textContent && !$('equation').textContent && !$('guidance').textContent, 'Exercise hides all generating-model labels');
const exercise = path();
$('guess-form').fire('submit'); assert(!$('guess-error').hidden && $('model').hidden, 'Incomplete guess does not reveal answer');
$('undecided').checked = true; $('undecided').fire('change');
assert($('guess-p').disabled && $('guess-q').disabled, 'Cannot decide disables order selectors');
$('guess-form').fire('submit'); assert(!$('model').hidden && !$('feedback').hidden, 'Check reveals answer and explains inference');
$('new-exercise').click(); assert($('model').hidden && $('feedback').hidden && !$('undecided').checked && !$('guess-p').disabled && $('guess-p').value === '', 'New exercise resets answers and reveal state');
$('reveal').click(); assert(!$('model').hidden && !$('guidance').hidden, 'Explicit reveal shows generator');
$('explore-mode').click(); assert(path() === exploration && !$('explore').hidden, 'Exploration survives exercise mode');
$('exercise-mode').click(); assert(!$('model').hidden && path() !== exercise, 'Exercise survives mode switching');
for (const model of [{ ar: [], ma: [] }, { ar: [.7], ma: [] }, { ar: [], ma: [.5] }, { ar: [.7], ma: [.5] }]) {
  context.exerciseModel = () => model;
  $('new-exercise').click();
  assert($('feedback').getAttribute('data-order-match') !== 'true', 'New exercise clears green feedback');
  $('guess-p').value = String(model.ar.length); $('guess-q').value = String(model.ma.length);
  $('guess-form').fire('submit');
  assert($('feedback').getAttribute('data-order-match') === 'true', 'Exact orders highlight feedback for every model family');
  $('guess-q').value = String((model.ma.length + 1) % 4); $('guess-form').fire('submit');
  assert($('feedback').getAttribute('data-order-match') === 'false', 'Different answer restores normal feedback background');
  $('guess-q').value = String(model.ma.length); $('guess-form').fire('submit');
  $('undecided').checked = true; $('guess-form').fire('submit');
  assert($('feedback').getAttribute('data-order-match') === 'false', 'Cannot decide keeps normal background even with matching selector values');
  $('undecided').checked = false; $('guess-form').fire('submit'); $('reveal').click();
  assert($('feedback').getAttribute('data-order-match') !== 'true', 'Reveal clears green feedback');
  $('guess-form').fire('submit'); $('guess-p').value = ''; $('guess-form').fire('submit');
  assert($('feedback').getAttribute('data-order-match') !== 'true', 'Incomplete answer clears green feedback');
}
for (const id of ['time', 'acf', 'pacf']) {
  assert($(id).querySelector('g') && $(id + '-desc').textContent.length > 20, `Accessible ${id} description`);
  assert(!JSON.stringify($(id).querySelector('g').attributes).includes('NaN'), `Finite ${id} graphics`);
}
console.log(`Passed ${checks} checks: ${cases.length} independent R cases, numerical safeguards, innovations, controls, and exercise behavior. No visual browser checks performed.`);
