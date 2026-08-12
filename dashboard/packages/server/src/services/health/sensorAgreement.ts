import type {
  BreathingRateDay,
  EightSleepDay,
  HeartRateDay,
  HrvDay,
  SensorAgreementData,
  SensorAgreementMetric,
  SensorAgreementSeries,
  SensorAgreementNight,
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
      nights: buildNights(sleep, eight),
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

  const regimes = new Set(raw.map((point) => point.fitbitRegime).filter(Boolean));
  const latestRegime = raw.at(-1)?.fitbitRegime ?? "unknown";
  const analysisRaw = raw.filter((point) => point.fitbitRegime === latestRegime);
  const analysisFitbitValues = analysisRaw.map((point) => point.fitbit);
  const analysisEightValues = analysisRaw.map((point) => point.eightSleep);
  const regimeStats = new Map([...regimes].map((regime) => {
    const group = raw.filter((point) => point.fitbitRegime === regime);
    const fitbitMean = avg(group.map((point) => point.fitbit));
    const eightMean = avg(group.map((point) => point.eightSleep));
    return [regime, {
      fitbitMean,
      eightMean,
      fitbitSd: populationSd(group.map((point) => point.fitbit), fitbitMean),
      eightSd: populationSd(group.map((point) => point.eightSleep), eightMean),
    }];
  }));
  const basePoints = raw.map((point) => {
    const stats = regimeStats.get(point.fitbitRegime)!;
    return {
      date: point.date,
      fitbit: point.fitbit,
      eightSleep: point.eightSleep,
      fitbitRegime: point.fitbitRegime,
      difference: def.comparable ? round(point.eightSleep - point.fitbit, 2) : null,
      fitbitZ: stats.fitbitSd > 0 ? round((point.fitbit - stats.fitbitMean) / stats.fitbitSd, 2) : null,
      eightSleepZ: stats.eightSd > 0 ? round((point.eightSleep - stats.eightMean) / stats.eightSd, 2) : null,
    };
  });
  const points = basePoints.map((point, index) => {
    const trendGap = point.fitbitZ != null && point.eightSleepZ != null
      ? round(Math.abs(point.fitbitZ - point.eightSleepZ), 2)
      : null;
    const window = basePoints.slice(0, index + 1)
      .filter((item) => item.fitbitRegime === point.fitbitRegime)
      .slice(-14);
    return {
      ...point,
      trendGap,
      trendAlignment: alignmentFor(trendGap),
      divergencePattern: null,
      rollingCorrelation: window.length >= 7
        ? pearson(window.map((item) => item.fitbit), window.map((item) => item.eightSleep))
        : null,
    };
  });
  markDivergencePatterns(points);
  const latestRollingCorrelation = points.at(-1)?.rollingCorrelation ?? null;

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
    correlation: analysisRaw.length >= 7 ? pearson(analysisFitbitValues, analysisEightValues) : null,
    meanDifference: def.comparable && analysisRaw.length > 0
      ? round(avg(analysisRaw.map((point) => point.eightSleep - point.fitbit)), 2)
      : null,
    meanAbsoluteDifference: def.comparable && analysisRaw.length > 0
      ? round(avg(analysisRaw.map((point) => Math.abs(point.eightSleep - point.fitbit))), 2)
      : null,
    evidence: evidenceFor(analysisRaw.length, regimes.size, latestRollingCorrelation),
    points,
    largestDivergences: def.comparable
      ? points.filter((point) => point.fitbitRegime === latestRegime)
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

function buildNights(sleepRows: SleepDay[], eightRows: EightSleepDay[]): SensorAgreementNight[] {
  const sleepByDate = new Map(sleepRows.map((row) => [row.date, row]));
  const eightByDate = new Map(eightRows.map((row) => [row.date, row]));
  const dates = [...new Set([...sleepByDate.keys(), ...eightByDate.keys()])].sort();
  return dates.map((date) => {
    const sleep = sleepByDate.get(date);
    const eight = eightByDate.get(date);
    return {
      date,
      fitbit: {
        sessionStart: sleep?.mainSleepStartTime ?? null,
        sessionEnd: sleep?.mainSleepEndTime ?? null,
        sleepDurationMin: sleep?.totalMinutesAsleep ?? null,
        deepMin: sleep?.minutesDeep ?? null,
        lightMin: sleep?.minutesLight ?? null,
        remMin: sleep?.minutesRem ?? null,
        wakeMin: sleep?.minutesWake ?? null,
        timeInBedMin: sleep?.totalMinutesInBed ?? null,
        napMin: sleep?.napMinutesAsleep ?? null,
        sleepRecords: sleep?.totalSleepRecords ?? null,
        efficiency: sleep?.efficiency ?? null,
        score: null,
        tossAndTurnCount: null,
        bedTempC: null,
        roomTempC: null,
        regime: sleep?.measurementMethod ?? "unknown",
      },
      eightSleep: {
        sessionStart: eight?.sleepStart ?? null,
        sessionEnd: eight?.sleepEnd ?? null,
        sleepDurationMin: eight?.sleepDurationMin ?? null,
        deepMin: eight?.deepMin ?? null,
        lightMin: eight?.lightMin ?? null,
        remMin: eight?.remMin ?? null,
        wakeMin: null,
        timeInBedMin: null,
        napMin: null,
        sleepRecords: null,
        efficiency: null,
        score: eight?.score ?? null,
        tossAndTurnCount: eight?.tnt ?? null,
        bedTempC: eight?.avgBedTempC ?? null,
        roomTempC: eight?.avgRoomTempC ?? null,
        regime: "eight_sleep_main_session_v1",
      },
    };
  });
}

function alignmentFor(trendGap: number | null): "unknown" | "aligned" | "mixed" | "divergent" {
  if (trendGap == null) return "unknown";
  if (trendGap <= 0.5) return "aligned";
  if (trendGap <= 1) return "mixed";
  return "divergent";
}

function markDivergencePatterns(points: SensorAgreementSeries["points"]): void {
  let start = -1;
  for (let index = 0; index <= points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    const continues = current?.trendAlignment === "divergent"
      && (!previous || previous.trendAlignment !== "divergent"
        || (previous.fitbitRegime === current.fitbitRegime && isNextDay(previous.date, current.date)));
    if (current?.trendAlignment === "divergent" && start < 0) start = index;
    const runEnds = start >= 0 && (!current || current.trendAlignment !== "divergent" || !continues);
    if (!runEnds) continue;
    const end = index - 1;
    const pattern = end - start + 1 >= 3 ? "sustained" : "isolated";
    for (let cursor = start; cursor <= end; cursor += 1) points[cursor].divergencePattern = pattern;
    start = current?.trendAlignment === "divergent" ? index : -1;
  }
}

function isNextDay(left: string, right: string): boolean {
  const leftMs = Date.parse(`${left}T00:00:00Z`);
  const rightMs = Date.parse(`${right}T00:00:00Z`);
  return rightMs - leftMs === 86_400_000;
}

function evidenceFor(analysisNights: number, regimeCount: number, latestRollingCorrelation: number | null) {
  const regimeNote = regimeCount > 1
    ? ` Statistics use ${analysisNights} nights from the latest measurement regime; earlier raw points remain visible.`
    : "";
  if (analysisNights < 7) {
    return {
      level: "insufficient" as const,
      analysisNights,
      regimeCount,
      correlationMinimumNights: 7,
      rollingWindowNights: 14,
      latestRollingCorrelation,
      interpretation: `Too few same-regime paired nights to judge agreement reliably.${regimeNote}`,
    };
  }
  if (analysisNights < 14) {
    return {
      level: "limited" as const,
      analysisNights,
      regimeCount,
      correlationMinimumNights: 7,
      rollingWindowNights: 14,
      latestRollingCorrelation,
      interpretation: `Directional agreement is preliminary and may move with more nights.${regimeNote}`,
    };
  }
  return {
    level: "established" as const,
    analysisNights,
    regimeCount,
    correlationMinimumNights: 7,
    rollingWindowNights: 14,
    latestRollingCorrelation,
    interpretation: `Enough same-regime paired nights for a useful directional comparison, not a sensor-accuracy verdict.${regimeNote}`,
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
