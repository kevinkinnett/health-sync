export type SensorAgreementMetric = "sleep" | "hrv" | "breathing" | "heartRate";

export interface SensorAgreementPoint {
  date: string;
  fitbit: number;
  eightSleep: number;
  /** Eight Sleep minus Fitbit-device value, only meaningful when comparable. */
  difference: number | null;
  /** Standardized within this selected window, for direction comparison. */
  fitbitZ: number | null;
  eightSleepZ: number | null;
}

export interface SensorAgreementDivergence {
  date: string;
  absoluteDifference: number;
  fitbit: number;
  eightSleep: number;
}

export interface SensorAgreementSeries {
  metric: SensorAgreementMetric;
  label: string;
  unit: string;
  measurementComparable: boolean;
  fitbitMeasurement: string;
  eightSleepMeasurement: string;
  fitbitRegimes: string[];
  eightSleepRegime: string;
  joinedDays: number;
  correlation: number | null;
  meanDifference: number | null;
  meanAbsoluteDifference: number | null;
  points: SensorAgreementPoint[];
  largestDivergences: SensorAgreementDivergence[];
}

export interface SensorAgreementData {
  start: string;
  end: string;
  timezone: string;
  dateSemantics: "local_wake_date";
  series: SensorAgreementSeries[];
}
