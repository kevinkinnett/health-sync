import type {
  BreathingRateDay,
  EightSleepDay,
  HeartRateDay,
  HrvDay,
  SensorAgreementData,
  SensorAgreementMetric,
  SensorAgreementSeries,
  SleepDay,
} from "@health-dashboard/shared";
import { avg, pearson } from "../stats.js";

interface RangeReader<T> {
  findByDateRange(start: string, end: string): Promise<T[]>;
}

interface SeriesDefinition<T> {
  metric: SensorAgreementMetric;
  label: string;
  unit: string;
  comparable: boolean;
  fitbitMeasurement: string;
  eightMeasurement: string;
  fitbitValue: (row: T) => number | null;
  eightValue: (row: EightSleepDay) => number | null;
  fitbitRegime: (row: T) => string;
}

/** Builds the paired-night evidence behind the readiness fusion summary. */
export class SensorAgreementService {
  constructor(
    private sleep: RangeReader<SleepDay>,
    private hrv: RangeReader<HrvDay>,
    private heartRate: RangeReader<HeartRateDay>,
    private breathing: RangeReader<BreathingRateDay>,
    private eightSleep: RangeReader<EightSleepDay>,
  ) {}

  async get(start: string, end: string, timezone: string): Promise<SensorAgreementData> {
    const [sleep, hrv, heartRate, breathing, eight] = await Promise.all([
      this.sleep.findByDateRange(start, end),
      this.hrv.findByDateRange(start, end),
      this.heartRate.findByDateRange(start, end),
      this.breathing.findByDateRange(start, end),
      this.eightSleep.findByDateRange(start, end),
    ]);

    return {
      start,
      end,
      timezone,
      dateSemantics: "local_wake_date",
      series: [
        buildSeries(sleep, eight, {
          metric: "sleep", label: "Main sleep duration", unit: "min", comparable: true,
          fitbitMeasurement: "Fitbit main-session sleep", eightMeasurement: "Eight Sleep main-session sleep",
          fitbitValue: (row) => row.totalMinutesAsleep,
          eightValue: (row) => row.sleepDurationMin,
          fitbitRegime: (row) => row.measurementMethod,
        }),
        buildSeries(hrv, eight, {
          metric: "hrv", label: "Overnight HRV", unit: "ms", comparable: true,
          fitbitMeasurement: "Fitbit overnight RMSSD", eightMeasurement: "Eight Sleep main-session RMSSD",
          fitbitValue: (row) => row.dailyRmssd,
          eightValue: (row) => row.avgHrvRmssd,
          fitbitRegime: (row) => row.measurementMethod,
        }),
        buildSeries(breathing, eight, {
          metric: "breathing", label: "Overnight breathing rate", unit: "/min", comparable: true,
          fitbitMeasurement: "Fitbit overnight breathing rate", eightMeasurement: "Eight Sleep main-session breathing rate",
          fitbitValue: (row) => row.breathingRate,
          eightValue: (row) => row.avgRespiratoryRate,
          fitbitRegime: () => "google_health_daily_respiratory_v1",
        }),
        buildSeries(heartRate, eight, {
          metric: "heartRate", label: "Heart-rate direction", unit: "bpm", comparable: false,
          fitbitMeasurement: "Daily resting heart rate", eightMeasurement: "Average sleeping heart rate",
          fitbitValue: (row) => row.restingHeartRate,
          eightValue: (row) => row.avgHeartRate,
          fitbitRegime: () => "google_health_daily_rhr_v1",
        }),
      ],
    };
  }
}

function buildSeries<T extends { date: string }>(
  fitbitRows: T[],
  eightRows: EightSleepDay[],
  def: SeriesDefinition<T>,
): SensorAgreementSeries {
  const fitbitByDate = new Map(fitbitRows.map((row) => [row.date, row]));
  const raw = eightRows.flatMap((eight) => {
    const fitbit = fitbitByDate.get(eight.date);
    if (!fitbit) return [];
    const fitbitValue = def.fitbitValue(fitbit);
    const eightValue = def.eightValue(eight);
    if (fitbitValue == null || eightValue == null) return [];
    return [{
      date: eight.date,
      fitbit: fitbitValue,
      eightSleep: eightValue,
      fitbitRegime: def.fitbitRegime(fitbit),
    }];
  }).sort((a, b) => a.date.localeCompare(b.date));

  const fitbitValues = raw.map((point) => point.fitbit);
  const eightValues = raw.map((point) => point.eightSleep);
  const fitbitMean = avg(fitbitValues);
  const eightMean = avg(eightValues);
  const fitbitSd = populationSd(fitbitValues, fitbitMean);
  const eightSd = populationSd(eightValues, eightMean);
  const points = raw.map(({ fitbitRegime: _fitbitRegime, ...point }) => ({
    ...point,
    difference: def.comparable ? round(point.eightSleep - point.fitbit, 2) : null,
    fitbitZ: fitbitSd > 0 ? round((point.fitbit - fitbitMean) / fitbitSd, 2) : null,
    eightSleepZ: eightSd > 0 ? round((point.eightSleep - eightMean) / eightSd, 2) : null,
  }));
  const regimes = new Set(raw.map((point) => point.fitbitRegime).filter(Boolean));

  return {
    metric: def.metric,
    label: def.label,
    unit: def.unit,
    measurementComparable: def.comparable,
    fitbitMeasurement: def.fitbitMeasurement,
    eightSleepMeasurement: def.eightMeasurement,
    fitbitRegimes: [...regimes].sort(),
    eightSleepRegime: "eight_sleep_main_session_v1",
    joinedDays: points.length,
    // A two- or three-night Pearson r often looks definitive while being
    // nearly unconstrained. Wait for one week of overlap before presenting it.
    correlation: points.length >= 7 ? pearson(fitbitValues, eightValues) : null,
    meanDifference: def.comparable && points.length > 0
      ? round(avg(points.map((point) => point.difference)), 2)
      : null,
    meanAbsoluteDifference: def.comparable && points.length > 0
      ? round(avg(points.map((point) => Math.abs(point.difference ?? 0))), 2)
      : null,
    points,
    largestDivergences: def.comparable
      ? [...points]
          .sort((a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0))
          .slice(0, 3)
          .map((point) => ({
            date: point.date,
            absoluteDifference: round(Math.abs(point.difference ?? 0), 2),
            fitbit: point.fitbit,
            eightSleep: point.eightSleep,
          }))
      : [],
  };
}

function populationSd(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
