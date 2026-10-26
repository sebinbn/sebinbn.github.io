// Small, dependency-free numerical core shared by the app and regression checks.
export const N = 200;
export const BURN_IN = 2000;
export const LAGS = 15;
export const BOUND = 1.959963984540054 / Math.sqrt(N);

export function coefficients(values) {
  if (values.length !== 3) throw new RangeError('Enter three coefficients per row.');
  const parsed = values.map((value, i) => {
    const text = String(value).trim();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(Number(text))) {
      throw new RangeError(`Coefficient ${i + 1} must be a finite number. Use 0 for an unused lag.`);
    }
    return Number(text);
  });
  while (parsed.length && parsed.at(-1) === 0) parsed.pop();
  return parsed;
}

// Schur step-down test: 1 - a1*z - ... - ap*z^p has all roots outside
// the unit circle iff every successive reflection coefficient has |k| < 1.
// This also handles complex roots, repeated roots, and degrees zero through three.
export function stable(ar) {
  let a = Array.from(ar);
  while (a.length && a.at(-1) === 0) a.pop();
  while (a.length) {
    const k = a.at(-1);
    if (!Number.isFinite(k) || Math.abs(k) >= 1 - 1e-10) return false;
    const denominator = 1 - k * k;
    a = a.slice(0, -1).map((value, i) => (value + k * a[a.length - 2 - i]) / denominator);
  }
  return true;
}

export function modelInfo(ar, ma) {
  return { p: ar.length, q: ma.length, stationary: stable(ar), invertible: stable(ma.map(x => -x)) };
}

export function whiteNoise(random = Math.random) {
  const errors = new Float64Array(BURN_IN + N);
  for (let i = 0; i < errors.length; i += 2) {
    const radius = 2 * Math.sqrt(-2 * Math.log(1 - random()));
    const angle = 2 * Math.PI * random();
    errors[i] = radius * Math.cos(angle);
    errors[i + 1] = radius * Math.sin(angle);
  }
  return errors;
}

export function simulate(ar, ma, errors) {
  if (ar.length > 3 || ma.length > 3 || ![...ar, ...ma].every(Number.isFinite)) throw new RangeError('Use at most three finite coefficients per row.');
  const info = modelInfo(ar, ma);
  const burn = info.stationary ? BURN_IN : 0;
  if (errors.length < burn + N) throw new RangeError('Not enough white-noise observations.');
  const values = new Float64Array(burn + N);
  for (let t = 0; t < values.length; t++) {
    let value = errors[t];
    for (let j = 0; j < ar.length; j++) if (t > j) value += ar[j] * values[t - j - 1];
    for (let j = 0; j < ma.length; j++) if (t > j) value += ma[j] * errors[t - j - 1];
    if (!Number.isFinite(value)) throw new RangeError('This simulation exceeded the browser’s numerical range. Try smaller coefficients.');
    values[t] = value;
  }
  return { values: values.slice(burn), burn, ...info };
}

export function correlations(values, lags = LAGS) {
  if (values.length <= lags || !Array.from(values).every(Number.isFinite)) throw new RangeError('Correlations need finite observations and fewer lags than observations.');
  const scale = Math.max(...Array.from(values, Math.abs));
  if (!scale) throw new RangeError('ACF and PACF are undefined for a constant series.');
  const scaled = Array.from(values, x => x / scale);
  const mean = scaled.reduce((sum, x) => sum + x, 0) / values.length;
  const centered = scaled.map(x => x - mean);
  const denominator = centered.reduce((sum, x) => sum + x * x, 0);
  if (!denominator) throw new RangeError('ACF and PACF are undefined for a constant series.');
  const acf = [1], pacf = [];
  for (let k = 1; k <= lags; k++) {
    let sum = 0;
    for (let t = k; t < values.length; t++) sum += centered[t] * centered[t - k];
    acf.push(sum / denominator);
  }
  // Durbin-Levinson recursion using the same sample autocovariances as R acf/pacf.
  let previous = [], variance = 1;
  for (let k = 1; k <= lags; k++) {
    let numerator = acf[k];
    for (let j = 1; j < k; j++) numerator -= previous[j - 1] * acf[k - j];
    const reflection = numerator / variance;
    if (!Number.isFinite(reflection) || variance <= 0) throw new RangeError('PACF could not be computed reliably for this sample.');
    const next = previous.map((x, j) => x - reflection * previous[k - 2 - j]);
    next.push(reflection);
    pacf.push(reflection);
    variance *= 1 - reflection * reflection;
    previous = next;
  }
  return { acf: acf.slice(1), pacf };
}

// Active coefficients exceed the teaching thresholds in magnitude, while
// every combination remains stationary, invertible, and free of cancellation.
const AR = [[], [.7], [.65, -.5], [.65, -.55, .45]];
const MA = [[], [.5], [.5, .35], [.5, .4, .3]];
export function exerciseModel(random = Math.random) {
  const family = random();
  const order = () => 1 + Math.floor(random() * 3);
  let p = 0, q = 0;
  if (family < .4) p = order();
  else if (family < .8) q = order();
  else if (family < .9) { p = order(); q = order(); }
  return { ar: [...AR[p]], ma: [...MA[q]] };
}

export function modelName(p, q) {
  return p === 0 && q === 0 ? 'White noise — ARMA(0,0)' : q === 0 ? `AR(${p})` : p === 0 ? `MA(${q})` : `ARMA(${p},${q})`;
}

export function explanation(p, q) {
  if (!p && !q) return 'White noise has zero population ACF and PACF at all positive lags. Sample spikes can cross the reference bounds by chance.';
  if (!q) return `For a stationary AR(${p}), the population PACF cuts off after lag ${p}, while the ACF tails off. Small coefficients and sampling variation can obscure the cutoff.`;
  if (!p) return `For an invertible MA(${q}), the population ACF cuts off after lag ${q}, while the PACF tails off. Small coefficients and sampling variation can obscure the cutoff.`;
  return 'For an ARMA model with both AR and MA terms, the ACF and PACF generally tail off. These plots alone cannot uniquely determine p and q. Compare candidate models using information criteria and residual diagnostics.';
}

export function exerciseFeedback(p, q, guessP, guessQ, undecided) {
  if (p && q) {
    const match = guessP === p && guessQ === q;
    return `${undecided ? '“Cannot decide” is the supported inference.' : match ? 'Your orders match the generator, but the plots do not establish them uniquely.' : 'Those orders do not match the generator; exact orders cannot be established from these plots alone.'} ${explanation(p, q)}`;
  }
  return `${undecided ? 'A single sample can be ambiguous. Here the population pattern suggests the generating orders shown below.' : guessP === p && guessQ === q ? 'Your orders match the generator.' : 'Your orders do not match the generator. Treat the visible pattern as evidence for candidate orders, rather than proof.'} ${explanation(p, q)}`;
}
