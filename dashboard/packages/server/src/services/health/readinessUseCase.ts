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
import { computeReadiness, type ReadinessDayInput } from "../readiness.js";
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
  ) {}

  async inputs(): Promise<ReadinessDayInput[]> {
    const limit = 90;
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
    const ensure = (date: string): ReadinessDayInput => {
      const existing = byDate.get(date);
      if (existing) return existing;
      const created: ReadinessDayInput = {
        date, hrv: {}, rhr: {}, sleepMin: {}, breathing: {}, spo2: {},
        skinTemp: null, restlessness: null,
      };
      byDate.set(date, created);
      return created;
    };

    // Fusion keys identify the physical sensor, while response provenance
    // separately records that Fitbit measurements arrived via Google Health.
    for (const value of hrv) ensure(value.date).hrv.fitbit = value.dailyRmssd;
    for (const value of heartRate) ensure(value.date).rhr.fitbit = value.restingHeartRate;
    for (const value of sleep) ensure(value.date).sleepMin.fitbit = value.totalMinutesAsleep;
    for (const value of breathing) ensure(value.date).breathing.fitbit = value.breathingRate;
    for (const value of spo2) ensure(value.date).spo2.fitbit = value.avgValue;
    for (const value of skinTemp) ensure(value.date).skinTemp = value.nightlyRelative;
    for (const value of eight) {
      const day = ensure(value.date);
      day.hrv.eightSleep = value.avgHrvRmssd;
      day.rhr.eightSleep = value.avgHeartRate;
      day.sleepMin.eightSleep = value.sleepDurationMin;
      day.breathing.eightSleep = value.avgRespiratoryRate;
      day.restlessness = value.tnt;
    }
    return [...byDate.values()];
  }

  async execute(historyDays?: number): Promise<ReadinessScore> {
    return computeReadiness(await this.inputs(), historyDays);
  }
}
