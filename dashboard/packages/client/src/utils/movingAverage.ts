export function movingAverage<T>(
  data: T[],
  getValue: (item: T) => number | null | undefined,
  window: number,
): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    let count = 0;
    for (let j = i - window + 1; j <= i; j++) {
      const v = getValue(data[j]);
      if (v != null) {
        sum += v;
        count++;
      }
    }
    result.push(count > 0 ? Math.round((sum / count) * 10) / 10 : null);
  }
  return result;
}
