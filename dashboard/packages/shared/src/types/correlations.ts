export interface CorrelationPair {
  xMetric: string;
  yMetric: string;
  xLabel: string;
  yLabel: string;
  correlation: number;
  points: { x: number; y: number; date: string }[];
  insight: string;
}

export interface ActivityBucket {
  label: string;
  days: number;
  avgSleepMin: number;
  avgDeepMin: number;
  avgEfficiency: number;
}

export interface CorrelationsData {
  pairs: CorrelationPair[];
  activitySleepBuckets: ActivityBucket[];
  dataPoints: number;
}
