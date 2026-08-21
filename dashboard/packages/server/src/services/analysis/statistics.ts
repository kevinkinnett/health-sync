import { pearson } from "../stats.js";

export interface ConfidenceInterval {
  low: number;
  high: number;
}

export function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sampleSd(values: number[]): number {
  if (values.length < 2) return 0;
  const center = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - center) ** 2, 0) /
      (values.length - 1),
  );
}

/** Spearman rho with average ranks for tied observations. */
export function spearman(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  return pearson(ranks(xs), ranks(ys));
}

/**
 * Deterministic moving-block bootstrap. Seven-day blocks retain some of the
 * serial dependence found in daily health data; a seeded generator keeps API
 * responses and tests stable across requests.
 */
export function blockBootstrapMeanInterval(
  values: number[],
  seed: string,
  iterations = 600,
  blockLength = 7,
): ConfidenceInterval {
  if (values.length < 2) {
    const value = round(values[0] ?? 0, 2);
    return { low: value, high: value };
  }
  const rng = seededRandom(seed);
  const estimates: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const sample = blockSample(values.length, rng, blockLength).map((index) => values[index]);
    estimates.push(mean(sample));
  }
  return percentileInterval(estimates);
}

export function blockBootstrapCorrelationInterval(
  xs: number[],
  ys: number[],
  seed: string,
  iterations = 400,
  blockLength = 7,
): ConfidenceInterval {
  if (xs.length !== ys.length || xs.length < 4) {
    const value = pearson(xs, ys);
    return { low: value, high: value };
  }
  const rng = seededRandom(seed);
  const estimates: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const indices = blockSample(xs.length, rng, blockLength);
    estimates.push(pearson(
      indices.map((index) => xs[index]),
      indices.map((index) => ys[index]),
    ));
  }
  return percentileInterval(estimates, 3);
}

export function correlationStability(xs: number[], ys: number[]): "stable" | "mixed" | "unstable" {
  if (xs.length < 18 || xs.length !== ys.length) return "mixed";
  const chunk = Math.floor(xs.length / 3);
  const correlations = [0, 1, 2].map((part) => {
    const start = part * chunk;
    const end = part === 2 ? xs.length : start + chunk;
    return pearson(xs.slice(start, end), ys.slice(start, end));
  });
  const material = correlations.filter((value) => Math.abs(value) >= 0.15);
  const signFlip = material.some((value) => value > 0) && material.some((value) => value < 0);
  if (signFlip) return "unstable";
  const spread = Math.max(...correlations) - Math.min(...correlations);
  return material.length >= 2 && spread <= 0.35 ? "stable" : "mixed";
}

/**
 * Empirical null that circularly shifts Y while preserving each series'
 * internal ordering. This is more honest for autocorrelated daily data than
 * treating every date as independent. Very short series deliberately return 1.
 */
export function circularShiftPValue(xs: number[], ys: number[], minimumShift = 7): number {
  if (xs.length !== ys.length || xs.length < minimumShift * 2 + 1) return 1;
  const observed = Math.abs(pearson(xs, ys));
  let asExtreme = 0;
  let trials = 0;
  for (let shift = minimumShift; shift <= xs.length - minimumShift; shift++) {
    const shifted = ys.map((_, index) => ys[(index + shift) % ys.length]);
    if (Math.abs(pearson(xs, shifted)) >= observed - 1e-9) asExtreme++;
    trials++;
  }
  return round((asExtreme + 1) / (trials + 1), 4);
}

/** Benjamini-Hochberg false-discovery-rate adjustment. */
export function adjustFalseDiscoveryRate(values: number[]): number[] {
  if (values.length === 0) return [];
  const ordered = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const adjusted = new Array<number>(values.length);
  let next = 1;
  for (let index = ordered.length - 1; index >= 0; index--) {
    const candidate = (ordered[index].value * ordered.length) / (index + 1);
    next = Math.min(next, candidate);
    adjusted[ordered[index].index] = round(Math.min(1, next), 4);
  }
  return adjusted;
}

function ranks(values: number[]): number[] {
  const ordered = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].value === ordered[start].value) end++;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index++) out[ordered[index].index] = rank;
    start = end;
  }
  return out;
}

function blockSample(length: number, rng: () => number, requestedLength: number): number[] {
  const blockLength = Math.min(requestedLength, length);
  const indices: number[] = [];
  while (indices.length < length) {
    const start = Math.floor(rng() * length);
    for (let offset = 0; offset < blockLength && indices.length < length; offset++) {
      indices.push((start + offset) % length);
    }
  }
  return indices;
}

function percentileInterval(values: number[], digits = 2): ConfidenceInterval {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    low: round(sorted[Math.floor((sorted.length - 1) * 0.025)], digits),
    high: round(sorted[Math.ceil((sorted.length - 1) * 0.975)], digits),
  };
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
