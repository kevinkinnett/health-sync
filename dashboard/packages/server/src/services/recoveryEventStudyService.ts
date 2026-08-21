import type { RecoveryEffectOutcome, RecoveryEventStudyData } from "@health-dashboard/shared";
import { NotFoundError } from "./errors.js";
import { buildRecoveryEventStudy } from "./analysis/recoveryEventStudyEngine.js";
import { estimateRecoveryEffects, RECOVERY_MIN_MATCHES } from "./analysis/recoveryEffectEngine.js";
import type { RecoveryAnalysisDatasetBuilder } from "./recoveryAnalysisDataset.js";

export const RECOVERY_EVENT_STUDY_METHOD_VERSION = "recovery-event-study-v1-descriptive-windows";

export class RecoveryEventStudyService {
  constructor(
    private readonly dataset: RecoveryAnalysisDatasetBuilder,
    private readonly timezone = "America/New_York",
  ) {}

  async get(today: string, activityId: number, outcome: RecoveryEffectOutcome): Promise<RecoveryEventStudyData> {
    const data = await this.dataset.build(today);
    const activity = data.activities.find((candidate) => candidate.id === activityId);
    if (!activity) throw new NotFoundError(`Recovery activity ${activityId} not found`);
    const effects = estimateRecoveryEffects(data.activities, data.periods);
    const matchedPairs = effects.matchedPairsByActivityOutcome.get(`${activityId}:${outcome}`) ?? 0;
    const study = buildRecoveryEventStudy(data.periods, activityId, outcome, matchedPairs);
    return {
      methodVersion: RECOVERY_EVENT_STUDY_METHOD_VERSION,
      timezone: this.timezone,
      window: data.window,
      activityId: activity.id,
      activityCode: activity.code,
      activityName: activity.name,
      outcome,
      outcomeLabel: study.outcomeDefinition.label,
      unit: study.outcomeDefinition.unit,
      betterDirection: study.outcomeDefinition.betterDirection,
      evidenceState: study.evidenceState,
      totalSessions: data.sessions.filter((session) => session.activityId === activityId).length,
      totalEvents: study.totalEvents,
      eligibleEvents: study.eligibleEvents,
      pendingSessions: data.sessions.filter((session) =>
        session.activityId === activityId && data.pendingSessionIds.has(session.id)
      ).length,
      matchedPairs,
      requiredMatchedPairs: RECOVERY_MIN_MATCHES,
      totalTrajectories: study.totalTrajectories,
      displayedTrajectories: study.trajectories.length,
      offsets: study.trajectories[0]?.points.map((point) => point.offsetDays) ??
        Array.from({ length: 15 }, (_, index) => index - 7),
      trajectories: study.trajectories,
      aggregate: study.aggregate,
      durationResponses: study.durationResponses,
      timingResponses: study.timingResponses,
      matchedEstimate: effects.effects.find((effect) =>
        effect.activityId === activityId && effect.outcome === outcome) ?? null,
      caveats: [
        "This timeline describes what happened around logged sessions. It does not prove the activity caused a change.",
        "Expected values are medians and observed ranges from up to eight nearby unexposed windows with similar prior health and training context.",
        "Recorded recovery exposures after a session remain visible but are excluded from the provisional aggregate.",
        "Workouts, illness, medication changes, and unrecorded behavior may still explain any point.",
        "Only the seven wake dates after a session are shown because longer attribution windows are too confounded.",
        "Duration associations do not adjust for the time between the session and sleep, available time, stress, or other reasons a longer session was possible.",
        data.currentDayIncluded
          ? "Today's completed main sleep is included; wake-day measures that have not arrived yet remain missing."
          : "The current Eastern calendar day enters this timeline only after a completed main sleep links to a session.",
      ],
    };
  }
}
