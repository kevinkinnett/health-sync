import type {
  BreathingRateDay,
  EightSleepDay,
  HeartRateDay,
  HrvDay,
  ReadinessScore,
  SkinTempDay,
  SleepDay,
  Spo2Day,
} from "@health-dashboard/shared";
import {
  computeReadiness,
  READINESS_TIMEZONE,
  type ReadinessDayInput,
} from "../readiness.js";
import type { SourceReading } from "../signalFusion.js";
import type { LatestReader } from "./summaryUseCase.js";

/** Owns recovery-signal assembly and scoring behind narrow latest-read ports. */
export class ReadinessUseCase {
  constructor(
    private hrv: LatestReader<HrvDay>,
    private heartRate: LatestReader<HeartRateDay>,
    private sleep: LatestReader<SleepDay>,
    private breathing: LatestReader<BreathingRateDay>,
    private spo2: LatestReader<Spo2Day>,
    private skinTemp: LatestReader<SkinTempDay>,
    private eightSleep: LatestReader<EightSleepDay>,
    private now: () => Date = () => new Date(),
  ) {}

  async inputs(limit = 90): Promise<ReadinessDayInput[]> {
    const [hrv, heartRate, sleep, breathing, spo2, skinTemp, eight] = await Promise.all([
      this.hrv.findLatest(limit),
      this.heartRate.findLatest(limit),
      this.sleep.findLatest(limit),
      this.breathing.findLatest(limit),
      this.spo2.findLatest(limit),
      this.skinTemp.findLatest(limit),
      this.eightSleep.findLatest(limit),
    ]);

    const byDate = new Map<string, ReadinessDayInput>();
    const today = localDateKey(this.now(), READINESS_TIMEZONE);
    const ensure = (date: string): ReadinessDayInput => {
      const existing = byDate.get(date);
      if (existing) return existing;
      const created: ReadinessDayInput = {
        date, hrv: {}, rhr: {}, sleepMin: {}, breathing: {}, spo2: {},
        skinTemp: null, restlessness: null,
        provisional: date === today,
      };
      byDate.set(date, created);
      return created;
    };

    // Fusion keys identify the physical sensor, while response provenance
    // separately records that Fitbit measurements arrived via Google Health.
    for (const value of heartRate) {
      ensure(value.date).rhr.fitbit = reading(
        value.restingHeartRate,
        "Daily resting heart rate",
        "daily_resting_hr",
        "google_health_daily_rhr_v1",
      );
    }
    for (const value of hrv) {
      const day = ensure(value.date);
      day.hrv.fitbit = reading(
        value.dailyRmssd,
        "Overnight HRV (RMSSD)",
        "overnight_hrv_rmssd",
        value.measurementMethod ?? "unknown",
      );
      if (value.nonRemHeartRate != null) {
        day.rhr.fitbit = reading(
          value.nonRemHeartRate,
          "Non-REM sleeping heart rate",
          "non_rem_sleeping_hr",
          value.measurementMethod,
        );
      }
    }
    for (const value of sleep) ensure(value.date).sleepMin.fitbit = reading(
      value.totalMinutesAsleep,
      "Main-session sleep duration",
      "main_sleep_duration",
      value.measurementMethod ?? "unknown",
    );
    for (const value of breathing) ensure(value.date).breathing.fitbit = reading(
      value.breathingRate,
      "Overnight respiratory rate",
      "overnight_breathing",
      "google_health_daily_respiratory_v1",
    );
    for (const value of spo2) ensure(value.date).spo2.fitbit = reading(
      value.avgValue,
      "Overnight oxygen saturation",
      "overnight_spo2",
      "google_health_overnight_spo2_v1",
    );
    for (const value of skinTemp) ensure(value.date).skinTemp = value.nightlyRelative;
    for (const value of eight) {
      const day = ensure(value.date);
      day.hrv.eightSleep = reading(value.avgHrvRmssd, "Overnight HRV (RMSSD)", "overnight_hrv_rmssd", "eight_sleep_main_session_v1");
      day.rhr.eightSleep = reading(value.avgHeartRate, "Average sleeping heart rate", "average_sleeping_hr", "eight_sleep_main_session_v1");
      day.sleepMin.eightSleep = reading(value.sleepDurationMin, "Main-session sleep duration", "main_sleep_duration", "eight_sleep_main_session_v1");
      day.breathing.eightSleep = reading(value.avgRespiratoryRate, "Overnight respiratory rate", "overnight_breathing", "eight_sleep_main_session_v1");
      day.restlessness = value.tnt;
    }
    return [...byDate.values()];
  }

  async execute(historyDays?: number): Promise<ReadinessScore> {
    return computeReadiness(await this.inputs(), historyDays);
  }
}

function reading(
  value: number | null,
  measurement: string,
  comparisonGroup: string,
  regime: string,
): SourceReading | null {
  return value == null ? null : { value, measurement, comparisonGroup, regime };
}

function localDateKey(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
