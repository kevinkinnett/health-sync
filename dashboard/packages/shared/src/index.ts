export type { ActivityDay } from "./types/activity.js";
export type { SleepDay } from "./types/sleep.js";
export type { HeartRateDay } from "./types/heartRate.js";
export type { WeightEntry } from "./types/weight.js";
export type { HrvDay } from "./types/hrv.js";
export type { ExerciseLog } from "./types/exerciseLog.js";
// Overnight "vitals" metrics — surfaced on the Vitals analytics screen
// and (the numeric three) fed into cross-metric correlations.
export type { Spo2Day } from "./types/spo2.js";
export type { BreathingRateDay } from "./types/breathingRate.js";
export type { SkinTempDay } from "./types/skinTemp.js";
export type { CardioScoreDay } from "./types/cardioScore.js";
export type { EightSleepDay } from "./types/eightSleep.js";
export type { FoodLogDay } from "./types/food.js";
export type { DrivingDay, DrivingSummary } from "./types/driving.js";
export type {
  IngestState,
  IngestRun,
  IngestRunTypeDetail,
  TriggerResponse,
  WindmillJob,
  WindmillCompletedJob,
  WindmillSchedule,
  IngestOverview,
} from "./types/ingest.js";
export type { SparklineData, HealthSummary } from "./types/api.js";
// DateRangeParams (also in ./types/api.js) is similarly unused and
// stays in-file pending a future "shared controller query param"
// helper.
export type {
  MetricComparison,
  DayOfWeekAvg,
  Highlight,
  WeeklyInsights,
} from "./types/insights.js";
export type {
  CorrelationPair,
  ActivityBucket,
  CorrelationsData,
} from "./types/correlations.js";
export type {
  DayOfWeekHeatmapMetric,
  DayOfWeekHeatmapData,
} from "./types/heatmap.js";
export type {
  InsightCategory,
  InsightGeneration,
  InsightGenerationSummary,
  InsightJob,
  InsightJobCategoryState,
  InsightJobStatus,
  StartInsightGenerationRequest,
  StartInsightGenerationResponse,
} from "./types/aiInsights.js";
export type {
  ChatTurn,
  ChatConversationSummary,
  ChatConversationResponse,
  ChatSendRequest,
  ChatSendResponse,
} from "./types/chat.js";
export type { ApiLogEntry, ApiLogStats } from "./types/apiLog.js";
export type {
  ReadinessBand,
  ReadinessComponentStatus,
  ReadinessMetric,
  ReadinessComponentSource,
  ReadinessComponent,
  ReadinessPoint,
  ReadinessScore,
} from "./types/readiness.js";
export type {
  AlertSeverity,
  HealthAlertKind,
  HealthAlert,
  AlertsResponse,
  AlertDelivery,
  EvaluateAlertsResponse,
} from "./types/alerts.js";
export type {
  NotificationThresholds,
  NotificationKindToggles,
  NotificationSettings,
  LlmTask,
  LlmModelSettings,
} from "./types/settings.js";
export type {
  PersonalRecord,
  Streak,
  RecordsData,
} from "./types/records.js";
export type {
  SupplementItem,
  SupplementIntake,
  SupplementIngredient,
  SupplementItemIngredient,
  SupplementIntakeIngredient,
  CreateSupplementItemBody,
  UpdateSupplementItemBody,
  CreateSupplementIntakeBody,
  CreateSupplementIngredientBody,
  UpdateSupplementIngredientBody,
  SetSupplementItemIngredientsBody,
} from "./types/supplement.js";
export type {
  MedicationItem,
  MedicationIntake,
  CreateMedicationItemBody,
  UpdateMedicationItemBody,
  CreateMedicationIntakeBody,
  UpdateMedicationIntakeBody,
} from "./types/medication.js";
export type {
  DossierItemType,
  DossierSectionKey,
  DossierSource,
  DossierSection,
  DossierContent,
  DossierEntry,
} from "./types/dossier.js";
export type {
  SupplementAdherence,
  DoseResponseSummary,
  LagProfile,
  IntakeByDay,
  IngredientByDay,
  IntakeCorrelations,
} from "./types/analytics.js";
export type { AppConfig } from "./types/config.js";

// NOTE: this package is TYPES-ONLY at runtime. It ships as raw `.ts`
// source (no build step) and is consumed by the server as compiled JS,
// which can only `import type` from here — a runtime value export would
// make the server's compiled code try to load `src/index.ts` and crash
// with ERR_UNKNOWN_FILE_EXTENSION. Do not add `export { someFn }` of a
// runtime value. Pure runtime helpers live in each runtime's own lib
// (e.g. server `services/userTz.ts`, client `lib/userTz.ts`).
export type {
  Intervention,
  InterventionKind,
  InterventionCategory,
  InterventionSource,
  DerivedIntervention,
  CreateInterventionBody,
  UpdateInterventionBody,
} from "./types/intervention.js";
export { isActiveOn } from "./types/intervention.js";
export type {
  ExperimentReport,
  ExperimentWindow,
  ExperimentConfidence,
  MetricEffect,
  EffectDirection,
  BetterDirection,
  Confound,
  ConfoundKind,
  ConfoundSeverity,
} from "./types/experiment.js";
export type {
  ExerciseType,
  TrainingLoadDay,
  TrainingSession,
  TrainingSummary,
} from "./types/training.js";

