import type { Page } from "@playwright/test";
import type {
  ActivityDay,
  AlertsResponse,
  ApiLogStats,
  AppConfig,
  ExperimentSummary,
  CorrelationsData,
  DayOfWeekHeatmapData,
  DrivingSummary,
  DossierEntry,
  FoodLogDay,
  HealthSummary,
  HeartRateDay,
  HrvDay,
  ExperimentReport,
  IngestOverview,
  IngestStatus,
  Intervention,
  LlmModelSettings,
  NotificationSettings,
  NutritionWeightReport,
  ReadinessScore,
  RecoveryAnomalyReport,
  RecordsData,
  SensorAgreementData,
  SupplementIngredient,
  SupplementItem,
  WeeklyInsights,
  WorkoutEffectsData,
} from "@health-dashboard/shared";

/**
 * Stubs the whole `/api/**` surface at the browser boundary so the smoke
 * tests need no server and no database.
 *
 * EVERY FIXTURE IS TYPED against the shared contract. That is the point:
 * the first version of this file guessed at shapes and paths, and the
 * suite failed with `Cannot read properties of undefined (reading
 * 'start')` because a stub returned `[]` where the app expected
 * `WeeklyInsights`. Typing them means a server-side contract change
 * breaks `pnpm typecheck` instead of producing a confusing red e2e run.
 *
 * What is NOT covered anywhere else — and what these tests exist for —
 * is whether the built bundle boots, resolves its modules and renders.
 * Controller behaviour is covered by the supertest suites; the
 * repository↔schema boundary by the SQL contract test.
 */

const TODAY = "2026-07-26";

/**
 * Six points, not three: the stat tiles derive an "above usual / steady"
 * verdict from this series and refuse to judge fewer than four readings,
 * so a three-point fixture silently skipped that whole code path.
 */
const spark = (v: number) => [
  { date: "2026-07-21", value: v * 0.88 },
  { date: "2026-07-22", value: v * 0.94 },
  { date: "2026-07-23", value: v * 0.91 },
  { date: "2026-07-24", value: v * 0.9 },
  { date: "2026-07-25", value: v * 0.95 },
  { date: TODAY, value: v },
];

const comparison = (current: number, previous: number) => ({
  current,
  previous,
  changePercent: Math.round(((current - previous) / previous) * 100),
});

const CONFIG: AppConfig = { userTimezone: "America/New_York" };

const FETCHED = `${TODAY}T12:00:00Z`;

const SUMMARY: HealthSummary = {
  activity: {
    latest: {
      date: TODAY,
      steps: 8432,
      caloriesOut: 2450,
      caloriesBmr: null,
      activeCalories: null,
      distanceKm: 6.1,
      floors: 4,
      minutesSedentary: 600,
      minutesLightlyActive: 140,
      minutesFairlyActive: 21,
      minutesVeryActive: 54,
      fetchedAt: FETCHED,
    },
    sparkline: spark(8432),
  },
  sleep: {
    latest: {
      date: TODAY,
      totalMinutesAsleep: 435,
      totalMinutesInBed: 479,
      totalSleepRecords: 1,
      napMinutesAsleep: 0,
      minutesDeep: 90,
      minutesLight: 250,
      minutesRem: 90,
      minutesWake: 43,
      efficiency: 91,
      mainSleepStartTime: `${TODAY}T05:10:00Z`,
      mainSleepEndTime: `${TODAY}T12:25:00Z`,
      measurementMethod: "main_sleep_v2",
      fetchedAt: FETCHED,
    },
    sparkline: spark(7.2),
  },
  heartRate: {
    latest: {
      date: TODAY,
      restingHeartRate: 65,
      zoneOutOfRangeMin: 1100,
      zoneFatBurnMin: 62,
      zoneCardioMin: 18,
      zonePeakMin: 0,
      zoneOutOfRangeCal: 1800,
      zoneFatBurnCal: 420,
      zoneCardioCal: 160,
      zonePeakCal: 0,
      fetchedAt: FETCHED,
    },
    sparkline: spark(65),
  },
  weight: {
    latest: {
      logId: "w-1",
      date: TODAY,
      time: null,
      weightKg: 80.2,
      bmi: null,
      fatPct: null,
      source: null,
      fetchedAt: FETCHED,
    },
    sparkline: spark(80.2),
  },
};

const WEEKLY: WeeklyInsights = {
  currentPeriod: { start: "2026-07-19", end: "2026-07-25" },
  previousPeriod: { start: "2026-07-12", end: "2026-07-18" },
  steps: comparison(6200, 5400),
  activeMinutes: comparison(34, 26),
  distance: comparison(4.2, 3.7),
  calories: comparison(2620, 2540),
  sleep: comparison(435, 421),
  sleepEfficiency: comparison(91, 89),
  restingHr: comparison(65, 66),
  dayOfWeek: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayName, i) => ({
    dow: i,
    dayName,
    avgSteps: 5000 + i * 300,
    avgActiveMinutes: 20 + i * 2,
    samples: 4,
  })),
  dayOfWeekDays: 28,
  highlights: [
    { kind: "positive", text: "Steps up 15% vs last week" },
    { kind: "neutral", text: "Fridays are your most active day" },
  ],
};

const HEATMAP: DayOfWeekHeatmapData = {
  dayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  dayDates: [],
  rows: [
    {
      metric: "steps",
      label: "Steps",
      unit: "steps",
      values: [5017, 7607, 7337, 5991, 5985, 3761, 56],
      min: 56,
      max: 7607,
    },
  ],
  totalDays: 7,
  dayCounts: [1, 1, 1, 1, 1, 1, 1],
};

const CORRELATIONS: CorrelationsData = {
  pairs: [
    {
      xMetric: "steps",
      yMetric: "sleepMin",
      xLabel: "Steps",
      yLabel: "Sleep (min)",
      correlation: 0.31,
      lagDays: 1,
      evidence: "exploratory_association",
      insight: "More steps is weakly associated with more sleep that night.",
      points: [
        { x: 5000, y: 410, date: "2026-07-20" },
        { x: 7600, y: 445, date: "2026-07-21" },
        { x: 7300, y: 430, date: "2026-07-22" },
      ],
    },
  ],
  activitySleepBuckets: [
    { label: "Low (<3k steps)", days: 4, avgSleepMin: 402, avgDeepMin: 84, avgEfficiency: 89 },
    { label: "Medium (3-6k)", days: 12, avgSleepMin: 431, avgDeepMin: 90, avgEfficiency: 91 },
    { label: "High (6k+)", days: 9, avgSleepMin: 446, avgDeepMin: 93, avgEfficiency: 92 },
  ],
  dataPoints: 25,
};

const WORKOUT_EFFECTS: WorkoutEffectsData = {
  methodVersion: "workout-effects-v1-matched-days",
  timezone: "America/New_York",
  window: { start: "2026-05-01", end: TODAY },
  sessions: 46,
  workoutDays: 34,
  effects: [
    {
      exposure: "all",
      exposureLabel: "Any workout",
      outcome: "sleep_duration",
      outcomeLabel: "Sleep that night",
      unit: "min",
      betterDirection: "up",
      workoutDays: 24,
      matchedRestDays: 24,
      workoutMean: 440,
      matchedRestMean: 420,
      adjustedDifference: 20,
      confidenceInterval: { low: 5, high: 34 },
      standardizedDifference: 0.3,
      conclusion: "helped",
      confidence: "moderate",
      evidence: "adjusted_association",
      interpretation: "Workout days were followed by 20 minutes more sleep than matched rest days.",
    },
  ],
  matching: {
    weekdayMatched: true,
    maximumDayDistance: 84,
    covariates: ["prior sleep", "morning recovery", "recent training load"],
  },
  caveats: ["Adjusted association only; unmeasured factors can still explain the difference."],
};

const SENSOR_AGREEMENT: SensorAgreementData = {
  start: "2026-07-20",
  end: TODAY,
  timezone: "America/New_York",
  dateSemantics: "local_wake_date",
  nights: [
    {
      date: "2026-07-25",
      fitbit: {
        sessionStart: "2026-07-25T03:15:00Z", sessionEnd: "2026-07-25T11:05:00Z",
        sleepDurationMin: 460, deepMin: 90, lightMin: 270, remMin: 100,
        wakeMin: 12, timeInBedMin: 472, napMin: 0, sleepRecords: 1,
        efficiency: 97, score: null, tossAndTurnCount: null, bedTempC: null,
        roomTempC: null, regime: "main_sleep_v2",
      },
      eightSleep: {
        sessionStart: "2026-07-25T03:05:00Z", sessionEnd: "2026-07-25T11:10:00Z",
        sleepDurationMin: 480, deepMin: 95, lightMin: 280, remMin: 105,
        wakeMin: null, timeInBedMin: null, napMin: null, sleepRecords: null,
        efficiency: null, score: 88, tossAndTurnCount: 7, bedTempC: 27.2,
        roomTempC: 20.4, regime: "eight_sleep_main_session_v1",
      },
    },
  ],
  series: [
    {
      metric: "sleep",
      label: "Main sleep duration",
      unit: "min",
      measurementComparable: true,
      fitbitMeasurement: "Fitbit main-session sleep",
      eightSleepMeasurement: "Eight Sleep main-session sleep",
      fitbitRegimes: ["main_sleep_v2"],
      eightSleepRegime: "eight_sleep_main_session_v1",
      joinedDays: 3,
      correlation: null,
      meanDifference: 8.3,
      meanAbsoluteDifference: 11.7,
      evidence: {
        level: "insufficient", analysisNights: 3, regimeCount: 1,
        correlationMinimumNights: 7, rollingWindowNights: 14,
        latestRollingCorrelation: null,
        interpretation: "Too few paired nights to judge agreement reliably.",
      },
      points: [
        { date: "2026-07-23", fitbitRegime: "main_sleep_v2", fitbit: 420, eightSleep: 430, difference: 10, fitbitZ: -1, eightSleepZ: -0.8, trendGap: 0.2, trendAlignment: "aligned", divergencePattern: null, rollingCorrelation: null },
        { date: "2026-07-24", fitbitRegime: "main_sleep_v2", fitbit: 440, eightSleep: 435, difference: -5, fitbitZ: 0, eightSleepZ: -0.2, trendGap: 0.2, trendAlignment: "aligned", divergencePattern: null, rollingCorrelation: null },
        { date: "2026-07-25", fitbitRegime: "main_sleep_v2", fitbit: 460, eightSleep: 480, difference: 20, fitbitZ: 1, eightSleepZ: 1, trendGap: 0, trendAlignment: "aligned", divergencePattern: null, rollingCorrelation: null },
      ],
      largestDivergences: [
        { date: "2026-07-25", absoluteDifference: 20, fitbit: 460, eightSleep: 480 },
      ],
    },
  ],
};

const RECORDS: RecordsData = {
  records: [
    { metric: "steps", label: "Most Steps", value: 14320, unit: "steps", date: "2026-05-18" },
    { metric: "sleep", label: "Longest Sleep", value: 512, unit: "min", date: "2026-06-02" },
  ],
  streaks: [
    { label: "5k+ Steps", current: 3, best: 11, unit: "days" },
    { label: "7+ Hours Sleep", current: 5, best: 14, unit: "days" },
  ],
};

const RECOVERY_ANOMALIES: RecoveryAnomalyReport = {
  methodVersion: "recovery-anomaly-v1-robust-weekday",
  timezone: "America/New_York",
  baselineWindowDays: 42,
  minimumBaselineDays: 14,
  window: { start: "2026-07-01", end: TODAY },
  excludedCurrentDate: TODAY,
  daysAnalyzed: 24,
  caveats: ["Unusual means different from your own recent pattern, not unhealthy or diagnostic."],
  unusualDays: [{
    date: "2026-07-25",
    score: 68,
    severity: "notable",
    direction: "worse",
    summary: "HRV, Resting HR made this a worse-than-usual recovery day.",
    coveragePct: 86,
    features: ["hrv", "rhr", "sleep"].map((metric, index) => ({
      metric: metric as "hrv" | "rhr" | "sleep",
      label: metric === "hrv" ? "HRV" : metric === "rhr" ? "Resting HR" : "Sleep",
      unit: metric === "sleep" ? "min" : metric === "rhr" ? "bpm" : "ms",
      value: 45 + index,
      expected: 52 + index,
      recoveryZ: -2.4 + index * 0.2,
      impact: "worse" as const,
      sources: [{
        provenance: {
          device: "fitbit" as const, deviceLabel: "Fitbit device",
          provider: "google_health" as const, providerLabel: "Google Health",
        },
        value: 45 + index,
        expected: 52 + index,
        z: -2.4 + index * 0.2,
        measurement: "Overnight measurement",
        regime: "current-v1",
        baselineDays: 42,
      }],
    })),
  }],
};

const DRIVING: DrivingSummary = {
  latestDate: TODAY,
  latestMinutes: 34,
  weekMinutes: 212,
  weekDrives: 9,
  trend: [
    { date: "2026-07-24", minutes: 41 },
    { date: "2026-07-25", minutes: 28 },
    { date: TODAY, minutes: 34 },
  ],
};

/** Several days so the line charts actually draw a path, not a single dot. */
const FOOD: FoodLogDay[] = [
  ["2026-07-24", 1980, 170, 84],
  ["2026-07-25", 2240, 195, 96],
  [TODAY, 2100, 180, 90],
].map(([date, caloriesIn, carbs, fat]) => ({
  date: date as string,
  caloriesIn: caloriesIn as number,
  carbs: carbs as number,
  fat: fat as number,
  fiber: 22,
  protein: 130,
  sugar: 40,
  saturatedFat: 25,
  sodium: 2300,
  cholesterol: 210,
  potassium: 3100,
  water: null,
  calorieGoal: null,
  foodCount: 6,
}));

/**
 * Joined fixture intentionally includes an unlogged day, a provisional
 * current day, and two weight readings on one local date.
 */
const NUTRITION_WEIGHT: NutritionWeightReport = {
  window: {
    start: "2026-07-20",
    end: TODAY,
    currentLocalDate: TODAY,
    completedThrough: "2026-07-25",
  },
  days: Array.from({ length: 7 }, (_, index) => {
    const date = `2026-07-${String(index + 20).padStart(2, "0")}`;
    const foods: Record<string, FoodLogDay | null> = {
      "2026-07-20": { ...FOOD[0], date, caloriesIn: 2050, protein: 126, fiber: 24 },
      "2026-07-21": { ...FOOD[0], date, caloriesIn: 2180, protein: 134, fiber: 27 },
      "2026-07-22": { ...FOOD[0], date, caloriesIn: 1940, protein: 119, fiber: 21 },
      "2026-07-23": null,
      "2026-07-24": FOOD[0],
      "2026-07-25": FOOD[1],
      [TODAY]: FOOD[2],
    };
    const weightObservations =
      date === "2026-07-20"
        ? [{ logId: "w-20", date, time: "07:10:00", weightKg: 80.6, bmi: null, fatPct: null, source: "google_health", fetchedAt: FETCHED }]
        : date === "2026-07-22"
          ? [{ logId: "w-22", date, time: "06:55:00", weightKg: 80.4, bmi: null, fatPct: null, source: "google_health", fetchedAt: FETCHED }]
          : date === "2026-07-24"
            ? [
                { logId: "w-24-am", date, time: "07:05:00", weightKg: 80.3, bmi: null, fatPct: null, source: "google_health", fetchedAt: FETCHED },
                { logId: "w-24-pm", date, time: "19:20:00", weightKg: 80.1, bmi: null, fatPct: null, source: "google_health", fetchedAt: FETCHED },
              ]
            : date === "2026-07-25"
              ? [{ logId: "w-25", date, time: null, weightKg: 80.2, bmi: null, fatPct: null, source: "google_health", fetchedAt: FETCHED }]
              : [];
    const dailyWeightMedianKg =
      date === "2026-07-20" ? 80.6
        : date === "2026-07-22" ? 80.4
          : date === "2026-07-24" || date === "2026-07-25" ? 80.2
            : null;
    return {
      date,
      provisional: date === TODAY,
      food: foods[date] ?? null,
      estimatedCaloriesOut: 2320 + index * 22,
      estimatedEnergyGap: foods[date]?.caloriesIn != null
        ? foods[date].caloriesIn! - (2320 + index * 22)
        : null,
      trainingLoad: index === 1 || index === 4 ? 42 + index : null,
      trainingMinutes: index === 1 || index === 4 ? 45 : null,
      weightObservations,
      dailyWeightMedianKg,
      weightTrendKg: index >= 4 && dailyWeightMedianKg != null ? 80.3 : null,
    };
  }),
  foodCoverage: {
    start: "2026-07-20",
    end: "2026-07-25",
    completedDays: 6,
    loggedDays: 5,
    unloggedDays: 1,
    percent: 83,
  },
  weight: {
    state: "ready",
    latest: { logId: "w-25", date: "2026-07-25", time: null, weightKg: 80.2, bmi: null, fatPct: null, source: "google_health", fetchedAt: FETCHED },
    observationCount: 5,
    observedDates: 4,
    currentTrendKg: 80.3,
    change7dKg: null,
    change30dKg: null,
    reasons: ["Seven-day and 30-day changes need trend values on both comparison dates."],
  },
  readiness: {
    state: "collecting",
    observedSpanDays: 6,
    foodLoggedDays: 5,
    weightObservedDates: 4,
    thresholds: { observedSpanDays: 42, foodLoggedDays: 30, weightObservedDates: 18 },
    reasons: [
      "Collect 42 completed span days.",
      "Log food on 30 completed days.",
      "Record weight on 18 distinct dates.",
    ],
  },
};

const INTERVENTIONS: Intervention[] = [
  {
    id: 1,
    kind: "period",
    category: "device",
    name: "Eight Sleep Pod",
    startedOn: "2026-05-02",
    endedOn: null,
    source: "manual",
    sourceRef: null,
    detail: null,
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
  },
  {
    id: 2,
    kind: "period",
    category: "medication",
    name: "Escitalopram 10 mg",
    startedOn: "2026-05-08",
    endedOn: null,
    source: "derived",
    sourceRef: "medication.item:1:dose:10:2026-05-08",
    detail: "80 logged doses, ongoing",
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
  },
];

const EXPERIMENT: ExperimentReport = {
  interventionId: 1,
  interventionName: "Eight Sleep Pod",
  interventionCategory: "device",
  evidence: "observed_change",
  changepoint: "2026-05-02",
  before: { start: "2026-02-11", end: "2026-05-01", days: 80, observedDays: 77 },
  after: { start: "2026-05-02", end: "2026-07-20", days: 80, observedDays: 80 },
  metrics: [
    {
      metric: "sleepMin",
      label: "Time asleep",
      unit: "min",
      betterDirection: "up",
      before: { n: 77, mean: 391.9, sd: 52 },
      after: { n: 80, mean: 435.4, sd: 44 },
      delta: 43.5,
      deltaPct: 11.1,
      direction: "up",
      effectSize: 0.9,
      improved: true,
      meaningful: true,
    },
  ],
  // A visible STEP at the changepoint for sleep, and a flat line for
  // resting HR — the two shapes the panels exist to tell apart.
  series: [
    {
      metric: "sleepMin",
      label: "Time asleep",
      unit: "min",
      betterDirection: "up",
      points: [
        { date: "2026-04-28", value: 388 },
        { date: "2026-04-29", value: 402 },
        { date: "2026-04-30", value: 379 },
        { date: "2026-05-01", value: 395 },
        { date: "2026-05-02", value: 441 },
        { date: "2026-05-03", value: 428 },
        { date: "2026-05-04", value: 447 },
        { date: "2026-05-05", value: 433 },
      ],
      beforeMean: 391.9,
      afterMean: 435.4,
      meaningful: true,
    },
    {
      metric: "restingHr",
      label: "Resting heart rate",
      unit: "bpm",
      betterDirection: "down",
      points: [
        { date: "2026-04-28", value: 67 },
        { date: "2026-04-29", value: 66 },
        { date: "2026-04-30", value: 68 },
        { date: "2026-05-01", value: 67 },
        { date: "2026-05-02", value: 67 },
        { date: "2026-05-03", value: 66 },
        { date: "2026-05-04", value: 67 },
        { date: "2026-05-05", value: 67 },
      ],
      beforeMean: 67,
      afterMean: 66.8,
      meaningful: false,
    },
  ],
  confounds: [
    {
      kind: "nearby_intervention",
      severity: "high",
      date: "2026-05-08",
      detail:
        '"Escitalopram 10 mg" started 6 days from this change — too close to separate the two.',
    },
  ],
  confidence: "weak",
  summary:
    'After "Eight Sleep Pod", time asleep improved — but something else could explain it.',
};

/**
 * Spans 2026-05-01..2026-05-10 so it overlaps the seeded intervention
 * dates — annotations only draw on dates the axis actually contains, so
 * a non-overlapping fixture would test nothing.
 */
const SPO2 = Array.from({ length: 10 }, (_, i) => ({
  date: `2026-05-${String(i + 1).padStart(2, "0")}`,
  avgValue: 95 + (i % 3),
  minValue: 90,
  maxValue: 99,
  fetchedAt: FETCHED,
}));

/**
 * Zone minutes off the watch. The per-zone CALORIE columns are null on
 * purpose: Google has no equivalent, so every day after the 2026-06-12
 * cutover carries nulls there. A fixture that filled them in would hide a
 * screen that crashed on real data.
 */
const HEART_RATE: HeartRateDay[] = [
  ["2026-07-30", 66, 33, 11],
  ["2026-07-31", 66, 26, 15],
].map(([date, restingHeartRate, zoneFatBurnMin, zoneCardioMin]) => ({
  date: date as string,
  restingHeartRate: restingHeartRate as number,
  zoneFatBurnMin: zoneFatBurnMin as number,
  zoneCardioMin: zoneCardioMin as number,
  zonePeakMin: 0,
  zoneOutOfRangeMin: null,
  zoneOutOfRangeCal: null,
  zoneFatBurnCal: null,
  zoneCardioCal: null,
  zonePeakCal: null,
  fetchedAt: FETCHED,
}));

/**
 * Spans the 2026-06-12 source change so the chart's caveat and marker are
 * exercised, and carries deepRmssd on every day — the series that silently
 * stopped drawing when the cutover left that column NULL.
 */
const HRV: HrvDay[] = [
  ["2026-06-11", 37.2, 33.0],
  ["2026-06-12", 43.9, 36.4],
  ["2026-06-13", 44.5, 37.1],
  ["2026-06-14", 41.8, 35.2],
].map(([date, dailyRmssd, deepRmssd]) => ({
  date: date as string,
  dailyRmssd: dailyRmssd as number,
  deepRmssd: deepRmssd as number,
  nonRemHeartRate: null,
  measurementMethod: "daily_hrv_v1",
  fetchedAt: FETCHED,
}));

/**
 * Enough days for the 7-day average to have a value, and varied active
 * minutes so both panels have real geometry to draw.
 */
const ACTIVITY: ActivityDay[] = Array.from({ length: 10 }, (_, i) => ({
  date: `2026-07-${String(i + 20).padStart(2, "0")}`,
  steps: 4000 + i * 420,
  caloriesOut: 2180 + i * 15,
  caloriesBmr: null,
  activeCalories: null,
  distanceKm: 3.1 + i * 0.3,
  floors: 4 + (i % 3),
  minutesSedentary: null,
  minutesLightlyActive: 110 + i,
  minutesFairlyActive: 8 + (i % 5) * 3,
  minutesVeryActive: 2 + (i % 4) * 4,
  fetchedAt: FETCHED,
}));

/**
 * One verdict WITH a headline and one without, so the home card's two
 * states are both exercised by the smoke run.
 */
const EXPERIMENT_SUMMARIES: ExperimentSummary[] = [
  {
    interventionId: 1,
    interventionName: "Eight Sleep Pod",
    interventionCategory: "device",
    changepoint: "2026-05-02",
    confidence: "weak",
    evidence: "observed_change",
    summary: "After the Eight Sleep Pod, sleep efficiency improved.",
    headline: {
      metric: "sleepEfficiency",
      label: "Sleep efficiency",
      unit: "%",
      betterDirection: "up",
      before: { n: 30, mean: 79.8, sd: 6.1 },
      after: { n: 30, mean: 91, sd: 3.2 },
      delta: 11.2,
      deltaPct: 14,
      direction: "up",
      effectSize: 1.9,
      improved: true,
      meaningful: true,
    },
  },
  {
    interventionId: 4,
    interventionName: "Strength training 3x/week",
    interventionCategory: "training",
    changepoint: "2026-07-06",
    confidence: "moderate",
    evidence: "observed_change",
    summary: "Nothing moved meaningfully after strength training.",
    headline: null,
  },
];

const ALERTS: AlertsResponse = { alerts: [], unreadCount: 0, openCount: 0 };
const LLM_MODELS: LlmModelSettings = { dossier: "sonnet", insights: "sonnet", chat: "sonnet" };

const NOTIFICATIONS: NotificationSettings = {
  pushEnabled: true,
  pushSeverities: ["warn", "alert"],
  kinds: { illnessTriad: true, lowSpo2: true, readinessDrop: true },
  thresholds: {
    illnessSigma: 1.5,
    spo2AlertBelow: 90,
    spo2WarnBelow: 93,
    readinessDropPoints: 15,
    cooldownDays: 2,
  },
  weeklyReportEnabled: true,
  appriseUrl: "",
};

const READINESS: ReadinessScore = {
  methodVersion: "readiness-v2-main-night",
  date: TODAY,
  score: 62,
  band: "balanced",
  summary: "Around your baseline.",
  baselineDays: 30,
  timezone: "America/New_York",
  confidence: "moderate",
  coveragePct: 57,
  provisional: true,
  caveats: ["Some readiness signals are unavailable, so available signals were reweighted."],
  components: [
    {
      metric: "hrv",
      label: "HRV",
      value: 48,
      baseline: 45,
      z: 0.4,
      contribution: 3.2,
      weightPct: 30,
      configuredWeight: 35,
      status: "good",
    },
    {
      metric: "sleep",
      label: "Sleep",
      value: 435,
      baseline: 428,
      z: 0.1,
      contribution: 0.8,
      weightPct: 25,
      configuredWeight: 25,
      status: "neutral",
    },
  ],
  history: [
    { date: "2026-07-24", score: 58, methodVersion: "readiness-v2-main-night", confidence: "moderate", coveragePct: 57 },
    { date: "2026-07-25", score: 60, methodVersion: "readiness-v2-main-night", confidence: "moderate", coveragePct: 57 },
    { date: TODAY, score: 62, methodVersion: "readiness-v2-main-night", confidence: "moderate", coveragePct: 57 },
  ],
};

const API_LOG_STATS: ApiLogStats = {
  windowHours: 24,
  totalCalls: 128,
  uniqueCallers: 3,
  avgDurationMs: 42,
  p95DurationMs: 180,
  errorCount: 0,
  errorRate: 0,
  byCaller: [{ caller: "dashboard", count: 128 }],
  byPath: [{ path: "/api/v1/summary", count: 64, avgDurationMs: 38 }],
};

const SUPPLEMENT_ITEMS: SupplementItem[] = [
  {
    id: 7,
    name: "Magnesium glycinate",
    brand: "Example Labs",
    form: "capsule",
    defaultAmount: 2,
    defaultUnit: "capsules",
    notes: "Evening",
    isActive: true,
    createdAt: FETCHED,
    updatedAt: FETCHED,
    ingredients: [
      {
        ingredientId: 1,
        ingredientName: "Magnesium",
        amount: 200,
        unit: "mg",
        sortOrder: 0,
      },
    ],
  },
];

const SUPPLEMENT_INGREDIENTS: SupplementIngredient[] = [
  {
    id: 1,
    name: "Magnesium",
    notes: null,
    createdAt: FETCHED,
    updatedAt: FETCHED,
  },
];

const SUPPLEMENT_DOSSIER: DossierEntry = {
  itemType: "supplement",
  itemId: 7,
  itemName: "Magnesium glycinate",
  itemBrand: "Example Labs",
  itemForm: "capsule",
  model: "sonnet",
  inputTokens: 800,
  outputTokens: 450,
  fetchedAt: FETCHED,
  content: {
    version: 1,
    headline: "A well-tolerated form of supplemental magnesium.",
    disclaimer: "Educational reference only; not medical advice.",
    sections: [
      {
        key: "summary",
        heading: "Summary",
        body: "Magnesium supports normal muscle and nerve function [1].",
        sourceIds: [1],
      },
      {
        key: "interactions",
        heading: "Interactions",
        body: "Separate it from some oral medicines when directed [1].",
        sourceIds: [1],
      },
    ],
    sources: [
      {
        id: 1,
        title: "Magnesium fact sheet",
        url: "https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/",
        publisher: "NIH Office of Dietary Supplements",
      },
    ],
  },
};

const INGEST_STATUS: IngestStatus = {
  provenance: {
    device: "fitbit",
    deviceLabel: "Fitbit device",
    provider: "google_health",
    providerLabel: "Google Health",
  },
  freshness: {
    status: "healthy",
    lastSuccessAtUtc: "2026-07-26T12:30:00.000Z",
    expectedIntervalMinutes: 240,
    staleAfterMinutes: 300,
  },
};

const INGEST_OVERVIEW: IngestOverview = {
  status: INGEST_STATUS,
  state: [],
  runs: [],
  windmillConnected: true,
  activeJobs: [],
  completedJobs: [],
  schedules: [],
};

/**
 * Path suffix → body.
 *
 * INVARIANT: never put an object literal in this table — reference a
 * typed const above. An inline literal escapes the shared-type check,
 * which is exactly how the first version of this file shipped a
 * `NotificationSettings` stub with the wrong keys and silently crashed
 * the /settings route (the page read `thresholds.illnessSigma` off
 * `undefined` and React unmounted the whole shell).
 */
const ROUTES: [RegExp, unknown][] = [
  [/\/api\/config$/, CONFIG],
  [/\/api\/health\/summary$/, SUMMARY],
  [/\/api\/health\/insights\/weekly$/, WEEKLY],
  [/\/api\/health\/heatmap\/day-of-week$/, HEATMAP],
  [/\/api\/health\/correlations$/, CORRELATIONS],
  [/\/api\/health\/workout-effects$/, WORKOUT_EFFECTS],
  [/\/api\/health\/sensor-agreement/, SENSOR_AGREEMENT],
  [/\/api\/health\/recovery-anomalies/, RECOVERY_ANOMALIES],
  [/\/api\/health\/records$/, RECORDS],
  [/\/api\/health\/driving$/, DRIVING],
  [/\/api\/health\/nutrition-weight/, NUTRITION_WEIGHT],
  [/\/api\/health\/food/, FOOD],
  [/\/api\/health\/readiness/, READINESS],
  // Before the /interventions/ pattern — order in this table is matched
  // first-wins, same as the server's route registration.
  [/\/api\/experiments\/summary$/, EXPERIMENT_SUMMARIES],
  [/\/api\/experiments\/interventions\//, EXPERIMENT],
  [/\/api\/interventions$/, INTERVENTIONS],
  [/\/api\/health\/spo2/, SPO2],
  [/\/api\/health\/heart-rate/, HEART_RATE],
  [/\/api\/health\/hrv/, HRV],
  [/\/api\/health\/activity/, ACTIVITY],
  [/\/api\/alerts/, ALERTS],
  [/\/api\/settings\/llm-models$/, LLM_MODELS],
  [/\/api\/settings\/notifications$/, NOTIFICATIONS],
  [/\/api\/admin\/api-logs\/stats/, API_LOG_STATS],
  [/\/api\/dossier\/supplement\/7$/, SUPPLEMENT_DOSSIER],
  [/\/api\/supplements\/items/, SUPPLEMENT_ITEMS],
  [/\/api\/supplements\/ingredients$/, SUPPLEMENT_INGREDIENTS],
  [/\/api\/ingest\/overview/, INGEST_OVERVIEW],
  [/\/api\/ingest\/status/, INGEST_STATUS],
  [/\/api\/ingest\/state/, []],
];

export async function stubApi(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    for (const [pattern, body] of ROUTES) {
      if (pattern.test(url)) {
        await route.fulfill({ json: body as object });
        return;
      }
    }
    // Unmatched endpoints are all list-shaped; an empty collection reads
    // as "no data yet" in the UI rather than an error.
    await route.fulfill({ json: [] });
  });
}

/**
 * Collects console errors and page exceptions. A blank screen caused by a
 * module-resolution or render crash shows up here even when a DOM
 * assertion happens to pass.
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

/**
 * Environment noise we accept: the PWA service worker and
 * favicon/manifest fetches under `vite preview`, unrelated to app
 * correctness.
 */
export function significant(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !/service ?worker|sw\.js|manifest|favicon|workbox/i.test(e) &&
      !/Failed to load resource.*40[34]/i.test(e),
  );
}
