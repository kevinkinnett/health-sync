export type { ActivityDay } from "./types/activity.js";
export type { SleepDay } from "./types/sleep.js";
export type { HeartRateDay } from "./types/heartRate.js";
export type { WeightEntry } from "./types/weight.js";
export type { HrvDay } from "./types/hrv.js";
export type { ExerciseLog } from "./types/exerciseLog.js";
// Spo2Day / BreathingRateDay / SkinTempDay / CardioScoreDay types
// stay in their source files for future wiring but are not yet
// surfaced to any caller; re-exporting them earlier was dead weight
// flagged by audit Tier 5.
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
  IntakeByDay,
  IngredientByDay,
  IntakeCorrelations,
} from "./types/analytics.js";
export type { AppConfig } from "./types/config.js";

// ---------------------------------------------------------------------------
// Runtime helpers (pure functions — usable from both server and client)
// ---------------------------------------------------------------------------
export { addDays, formatDateInTz, todayInTz } from "./lib/dates.js";
