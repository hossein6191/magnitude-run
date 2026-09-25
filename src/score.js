// Magnitude is logarithmic on purpose: the Richter scale is log10 of amplitude,
// so doubling your run does not double your number. Typical first run lands
// around M 3, a good run around M 6, a great one above M 8.
export function magnitudeFor(distM, shards) {
  const score = distM + shards * 20;
  return Math.min(9.9, 1 + Math.log10(1 + score / 50) * 2.2);
}

// USGS magnitude classes.
export function tierFor(m) {
  if (m < 2) return 'Micro';
  if (m < 4) return 'Minor';
  if (m < 5) return 'Light';
  if (m < 6) return 'Moderate';
  if (m < 7) return 'Strong';
  if (m < 8) return 'Major';
  return 'Great';
}

export const LADDER = [
  [1, 'Micro'], [2, 'Minor'], [4, 'Light'], [5, 'Moderate'],
  [6, 'Strong'], [7, 'Major'], [8, 'Great'],
];
