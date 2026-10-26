// Histogram-mode bins are fixed independently of plot bounds and histogram rebinning.
export const MODE_WIDTH = 2.5;
export const STATISTICS = {
  mean: 'Mean', median: 'Median', mode: 'Mode (histogram estimate)',
  populationVariance: 'Population variance (N denominator)',
  sampleVariance: 'Sample variance (N−1 denominator)'
};

// The symmetric Gaussian mixture has two peaks slightly inside 30 and 70.
const bimodalModes = (() => {
  const slope = x => (30 - x) * Math.exp(-((x - 30) ** 2) / 98)
    + (70 - x) * Math.exp(-((x - 70) ** 2) / 98);
  let lo = 30, hi = 40;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (slope(mid) > 0) lo = mid; else hi = mid;
  }
  const peak = (lo + hi) / 2;
  return [peak, 100 - peak];
})();

export function populationLocations(type, probabilities = []) {
  switch (type) {
    case 'normal': return { median: 50, modes: [50] };
    case 'uniform': return { median: 50, modeRanges: [[0, 100]], uniform: true };
    case 'right': return { median: 20 * Math.LN2, modes: [0] };
    case 'left': return { median: 100 - 20 * Math.LN2, modes: [100] };
    case 'bimodal': return { median: 50, modes: bimodalModes, approximate: true };
    case 'custom': {
      const total = probabilities.reduce((sum, p) => sum + p, 0);
      if (!(total > 0)) return null;
      const masses = probabilities.map(p => p / total), width = 100 / masses.length;
      let cumulative = 0, median;
      for (let i = 0; i < masses.length; i++) {
        const mass = masses[i], next = cumulative + mass;
        if (mass > 0 && next >= .5 - 1e-12) {
          median = (i + Math.max(0, Math.min(1, (.5 - cumulative) / mass))) * width;
          if (Math.abs(next - .5) < 1e-12) {
            let j = i + 1;
            while (j < masses.length && masses[j] === 0) j++;
            if (j < masses.length) median = (median + j * width) / 2;
          }
          break;
        }
        cumulative = next;
      }
      const peak = Math.max(...masses), modeRanges = [];
      let previous = -2;
      masses.forEach((mass, i) => {
        if (Math.abs(mass - peak) > peak * 1e-12) return;
        if (i === previous + 1) modeRanges[modeRanges.length - 1][1] = (i + 1) * width;
        else modeRanges.push([i * width, (i + 1) * width]);
        previous = i;
      });
      return { median, modeRanges };
    }
    default: throw new RangeError('Unsupported population.');
  }
}

export function calculateStatistic(values, statistic, random = Math.random) {
  const n = values.length;
  if (!n || !Object.hasOwn(STATISTICS, statistic)) throw new RangeError('A nonempty sample and supported statistic are required.');
  // Welford's algorithm avoids subtracting two large, nearly equal squared sums.
  let mean = 0, m2 = 0;
  values.forEach((x, i) => { const delta = x - mean; mean += delta / (i + 1); m2 += delta * (x - mean); });
  let value, modalBin = null, tiedBins = 0, modalCount = 0;
  switch (statistic) {
    case 'mean': value = mean; break;
    case 'median': {
      const sorted = Array.from(values).sort((a, b) => a - b), middle = Math.floor(n / 2);
      value = n % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
      break;
    }
    case 'mode': {
      const bins = new Map();
      values.forEach(x => { const bin = Math.floor(x / MODE_WIDTH); bins.set(bin, (bins.get(bin) || 0) + 1); });
      modalCount = Math.max(...bins.values());
      const ties = [...bins].filter(([, count]) => count === modalCount).map(([bin]) => bin);
      tiedBins = ties.length;
      modalBin = ties[Math.floor(random() * tiedBins)];
      value = (modalBin + .5) * MODE_WIDTH;
      break;
    }
    case 'populationVariance': value = Math.max(0, m2) / n; break;
    case 'sampleVariance': value = n > 1 ? Math.max(0, m2) / (n - 1) : NaN; break;
  }
  return { value, mean, modalBin, tiedBins, modalCount };
}
