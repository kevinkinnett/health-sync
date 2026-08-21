import type { RecoveryEffectsData } from "@health-dashboard/shared";
import {
  estimateRecoveryEffects,
  RECOVERY_MAX_MATCH_DAY_DISTANCE,
  RECOVERY_MAX_SESSION_TO_SLEEP_HOURS,
  RECOVERY_MIN_MATCHES,
} from "./analysis/recoveryEffectEngine.js";
import type { RecoveryAnalysisDatasetBuilder } from "./recoveryAnalysisDataset.js";

export const RECOVERY_EFFECT_METHOD_VERSION = "recovery-effects-v1-matched-sleep-periods";

/** Repository orchestration for recovery-session matched-period analysis. */
export class RecoveryEffectsService {
  constructor(
    private readonly dataset: RecoveryAnalysisDatasetBuilder,
    private readonly timezone = "America/New_York",
  ) {}

  async get(today: string): Promise<RecoveryEffectsData> {
    const data = await this.dataset.build(today);
    const engine = estimateRecoveryEffects(data.activities, data.periods);
    const alignedSessionIds = new Set(data.periods.flatMap((period) => period.sessions.map((session) => session.id)));
    const coverage = data.activities.map((activity) => {
      const activitySessions = data.sessions.filter((session) => session.activityId === activity.id);
      const combinedExposures = data.periods.filter((period) => {
        const ids = new Set(period.sessions.map((session) => session.activityId));
        return ids.size > 1 && ids.has(activity.id);
      }).length;
      return {
        activityId: activity.id,
        activityCode: activity.code,
        activityName: activity.name,
        sessions: activitySessions.length,
        alignedSessions: activitySessions.filter((session) => alignedSessionIds.has(session.id)).length,
        combinedExposures,
        matchedPairs: engine.matchedPairsByActivity.get(activity.id) ?? 0,
        requiredPairs: RECOVERY_MIN_MATCHES,
      };
    });

    return {
      methodVersion: RECOVERY_EFFECT_METHOD_VERSION,
      timezone: this.timezone,
      window: data.window,
      coverage,
      effects: engine.effects,
      matching: {
        weekdayMatched: true,
        maximumDayDistance: RECOVERY_MAX_MATCH_DAY_DISTANCE,
        maximumSessionToSleepHours: RECOVERY_MAX_SESSION_TO_SLEEP_HOURS,
        minimumMatchedPairs: RECOVERY_MIN_MATCHES,
        covariates: [
          "prior main-sleep duration",
          "prior resting heart rate",
          "prior HRV",
          "prior 7-day training load",
          "calendar proximity",
        ],
      },
      caveats: [
        "These are adjusted within-person associations, not proof that a recovery activity caused the change.",
        "A session is assigned to the first main overnight sleep that starts after it ends, up to 24 hours later.",
        "Nights containing more than one recovery activity type are counted as combined exposures but excluded from single-activity estimates.",
        "Each outcome is matched separately, so missing sensor data can produce different sample counts.",
        "The current Eastern calendar day is excluded because its sleep and recovery data may still be incomplete.",
      ],
    };
  }
}
