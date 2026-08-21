export type RecoveryActivityCategory = "heat_therapy" | "massage" | "other";
export type RecoverySessionSource = "manual" | "ai_chat";
export type RecoveryPendingActionStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "expired";

export interface RecoveryActivity {
  id: number;
  code: string;
  name: string;
  category: RecoveryActivityCategory;
  defaultDurationMinutes: number | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface RecoverySession {
  id: number;
  activityId: number;
  activityCode: string;
  activityName: string;
  activityCategory: RecoveryActivityCategory;
  startedAt: string;
  durationMinutes: number;
  intensity: number | null;
  temperatureF: number | null;
  massageType: string | null;
  notes: string | null;
  source: RecoverySessionSource;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecoveryActivityBody {
  code: string;
  name: string;
  category: RecoveryActivityCategory;
  defaultDurationMinutes?: number | null;
  notes?: string | null;
}

export interface UpdateRecoveryActivityBody {
  name?: string;
  defaultDurationMinutes?: number | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface CreateRecoverySessionBody {
  activityId: number;
  startedAt?: string;
  durationMinutes?: number;
  intensity?: number | null;
  temperatureF?: number | null;
  massageType?: string | null;
  notes?: string | null;
}

export interface UpdateRecoverySessionBody {
  activityId?: number;
  startedAt?: string;
  durationMinutes?: number;
  intensity?: number | null;
  temperatureF?: number | null;
  massageType?: string | null;
  notes?: string | null;
}

export interface RecoverySessionProposal {
  activityId: number;
  activityCode: string;
  activityName: string;
  activityCategory: RecoveryActivityCategory;
  startedAt: string;
  durationMinutes: number;
  intensity: number | null;
  temperatureF: number | null;
  massageType: string | null;
  notes: string | null;
}

export interface RecoveryPendingAction {
  id: string;
  conversationId: string;
  status: RecoveryPendingActionStatus;
  proposal: RecoverySessionProposal;
  sessionId: number | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrepareRecoverySessionActionBody {
  activity: string;
  startedLocal: string;
  durationMinutes?: number;
  intensity?: number | null;
  temperatureF?: number | null;
  massageType?: string | null;
  notes?: string | null;
}

export type ConfirmRecoveryPendingActionBody = Partial<
  Pick<
    RecoverySessionProposal,
    | "startedAt"
    | "durationMinutes"
    | "intensity"
    | "temperatureF"
    | "massageType"
    | "notes"
  >
>;

export type RecoveryEffectOutcome =
  | "sleep_duration"
  | "sleep_efficiency"
  | "resting_heart_rate"
  | "hrv"
  | "restlessness"
  | "readiness";

export type RecoveryEffectConclusion = "helped" | "cost" | "unclear";
export type RecoveryEffectConfidence = "limited" | "moderate" | "high";

export interface RecoveryEffectCoverage {
  activityId: number;
  activityCode: string;
  activityName: string;
  sessions: number;
  alignedSessions: number;
  combinedExposures: number;
  matchedPairs: number;
  requiredPairs: number;
}

export interface RecoveryEffectEstimate {
  activityId: number;
  activityCode: string;
  activityName: string;
  outcome: RecoveryEffectOutcome;
  outcomeLabel: string;
  unit: string;
  betterDirection: "up" | "down";
  exposedPeriods: number;
  matchedControlPeriods: number;
  exposedMean: number;
  controlMean: number;
  adjustedDifference: number;
  confidenceInterval: { low: number; high: number };
  standardizedDifference: number | null;
  conclusion: RecoveryEffectConclusion;
  confidence: RecoveryEffectConfidence;
  evidence: "adjusted_association";
  interpretation: string;
}

export interface RecoveryEffectsData {
  methodVersion: string;
  timezone: string;
  window: { start: string | null; end: string | null };
  coverage: RecoveryEffectCoverage[];
  effects: RecoveryEffectEstimate[];
  matching: {
    weekdayMatched: true;
    maximumDayDistance: number;
    maximumSessionToSleepHours: number;
    minimumMatchedPairs: number;
    covariates: string[];
  };
  caveats: string[];
}
