// Histogram-mode bins are fixed independently of plot bounds and histogram rebinning.
export const MODE_WIDTH = 2.5;
export const STATISTICS = {
  mean: 'Mean', median: 'Median', mode: 'Mode (histogram estimate)',
  populationVariance: 'Population variance (N denominator)',
  sampleVariance: 'Sample variance (N−1 denominator)'
};

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
