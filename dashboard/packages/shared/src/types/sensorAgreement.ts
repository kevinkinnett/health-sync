export type SensorAgreementMetric = "sleep" | "hrv" | "breathing" | "heartRate";

export type SensorAgreementEvidenceLevel = "insufficient" | "limited" | "established";
export type SensorTrendAlignment = "unknown" | "aligned" | "mixed" | "divergent";
export type SensorDivergencePattern = "isolated" | "sustained" | null;

export interface SensorAgreementEvidence {
  level: SensorAgreementEvidenceLevel;
  /** Paired nights in the latest Fitbit measurement regime used for statistics. */
  analysisNights: number;
  regimeCount: number;
  correlationMinimumNights: number;
  rollingWindowNights: number;
  latestRollingCorrelation: number | null;
  interpretation: string;
}

export interface SensorSleepSessionContext {
  sessionStart: string | null;
  sessionEnd: string | null;
  sleepDurationMin: number | null;
  deepMin: number | null;
  lightMin: number | null;
  remMin: number | null;
  wakeMin: number | null;
  timeInBedMin: number | null;
  napMin: number | null;
  sleepRecords: number | null;
  efficiency: number | null;
  score: number | null;
  tossAndTurnCount: number | null;
  bedTempC: number | null;
  roomTempC: number | null;
  regime: string;
}

/** Session evidence shared by every metric measured on one local wake date. */
export interface SensorAgreementNight {
  date: string;
  fitbit: SensorSleepSessionContext;
  eightSleep: SensorSleepSessionContext;
}

export interface SensorAgreementPoint {
  date: string;
  fitbitRegime: string;
  fitbit: number;
  eightSleep: number;
  /** Eight Sleep minus Fitbit-device value, only meaningful when comparable. */
  difference: number | null;
  /** Standardized within this selected window, for direction comparison. */
  fitbitZ: number | null;
  eightSleepZ: number | null;
  /** Absolute gap between the sensors' within-window z-scores. */
  trendGap: number | null;
  trendAlignment: SensorTrendAlignment;
  /** Three or more consecutive divergent joined nights are sustained. */
  divergencePattern: SensorDivergencePattern;
  /** Pearson r over up to the trailing 14 joined nights (minimum 7). */
  rollingCorrelation: number | null;
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
  evidence: SensorAgreementEvidence;
  points: SensorAgreementPoint[];
  largestDivergences: SensorAgreementDivergence[];
}

export interface SensorAgreementData {
  start: string;
  end: string;
  timezone: string;
  dateSemantics: "local_wake_date";
  nights: SensorAgreementNight[];
  series: SensorAgreementSeries[];
}
