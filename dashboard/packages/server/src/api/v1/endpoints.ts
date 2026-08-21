import type { HealthDataService } from "../../services/healthDataService.js";
import type { AnalyticsUseCases } from "../../services/analytics/contracts.js";
import type { SupplementService } from "../../services/supplementService.js";
import type { MedicationService } from "../../services/medicationService.js";
import type { TrainingService } from "../../services/training/trainingService.js";
import { todayInTz, addDays } from "../../services/userTz.js";

/**
 * Minimal JSON-Schema-ish shape for query parameters. Only the fields
 * the OpenAPI generator actually inspects are typed here.
 */
export interface ParamSchema {
  type: "string" | "number" | "integer" | "boolean";
  description?: string;
  enum?: readonly string[];
  default?: string | number | boolean;
}

export interface ParamsSchema {
  type: "object";
  properties: Record<string, ParamSchema>;
  required?: string[];
}

export interface V1EndpointDef {
  /** REST path under `/api/v1` (e.g. "/summary"). */
  path: string;
  /** Short title shown in Swagger UI. */
  summary: string;
  /** Long description shown in Swagger UI and OpenAPI clients. */
  description: string;
  /** JSON Schema for query params (renders to OpenAPI). */
  parameters?: ParamsSchema;
  /**
   * Async handler called with parsed query args. Return any
   * JSON-serializable value — the router wraps it as
   * `{ data, timestamp }`.
   */
  handler: (
    args: Record<string, unknown>,
    ctx: V1Context,
  ) => Promise<unknown>;
}

/** Services + config the handlers can reach for. */
export interface V1Context {
  userTimezone: string;
  healthDataService: HealthDataService;
  analyticsService: AnalyticsUseCases;
  supplementService: SupplementService;
  medicationService: MedicationService;
  trainingService: TrainingService;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a `start`/`end` window from query args. Defaults to "last 30
 * days in user TZ" when either bound is missing — same convention the
 * dashboard's controllers use, so v1 callers see the same windowing
 * semantics the UI does.
 */
function resolveDateRange(
  args: Record<string, unknown>,
  tz: string,
): { start: string; end: string } {
  const start = typeof args.start === "string" ? args.start : undefined;
  const end = typeof args.end === "string" ? args.end : undefined;
  if (start && end) return { start, end };
  const today = todayInTz(tz);
  return { start: addDays(today, -30), end: today };
}

function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function asInt(v: unknown, fallback: number): number {
  return Math.trunc(asNumber(v, fallback));
}

function asId(v: unknown): number | null {
  const n = asNumber(v, NaN);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// Endpoint definitions — single source of truth
// ---------------------------------------------------------------------------

const dateRangeParams: ParamsSchema = {
  type: "object",
  properties: {
    start: {
      type: "string",
      description: "Start date YYYY-MM-DD (inclusive). Defaults to 30 days ago in the user's timezone.",
    },
    end: {
      type: "string",
      description: "End date YYYY-MM-DD (inclusive). Defaults to today in the user's timezone.",
    },
  },
};

/**
 * Build the v1 endpoint list. Adding a new endpoint is one entry here —
 * the OpenAPI generator, route binder, and Quick Start UI all consume
 * this same array, so a new endpoint shows up everywhere automatically.
 */
export function buildV1Endpoints(): V1EndpointDef[] {
  return [
    // -----------------------------------------------------------------
    // Health metrics — date-window queries
    // -----------------------------------------------------------------
    {
      path: "/summary",
      summary: "Health summary",
      description:
        "Latest values plus 30-day sparklines for activity, sleep, heart rate, weight, and HRV. Useful for one-call dashboard snapshots.",
      handler: async (_args, ctx) => ctx.healthDataService.getSummary(),
    },
    {
      path: "/activity",
      summary: "Daily activity series",
      description:
        "Per-day steps, distance (km), calories, and active minutes for the requested window.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getActivity(start, end);
      },
    },
    {
      path: "/sleep",
      summary: "Daily sleep series",
      description:
        "Per-day MAIN overnight sleep totals, stages (deep / REM / light / awake), efficiency, and bedtime / wake-time instants. `date` is the America/New_York local wake date. Naps are excluded from the main totals and reported separately in `napMinutesAsleep`; `measurementMethod` identifies source/algorithm regimes.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getSleep(start, end);
      },
    },
    {
      path: "/heart-rate",
      summary: "Daily heart rate series",
      description:
        "Per-day resting heart rate plus zone minutes (out-of-range / fat burn / cardio / peak).",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getHeartRate(start, end);
      },
    },
    {
      path: "/hrv",
      summary: "Daily HRV series",
      description:
        "Per-day heart-rate variability (RMSSD): the daily overnight value, deep-sleep value when available, and Google Health native non-REM heart rate when available. `measurementMethod` distinguishes native/fallback source regimes; do not join absolute baselines across regimes.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getHrv(start, end);
      },
    },
    {
      path: "/weight",
      summary: "Daily weight series",
      description:
        "Per-day weight log entries from connected scales / manual entries. Values are stored in kilograms.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getWeight(start, end);
      },
    },
    {
      path: "/exercise-logs",
      summary: "Exercise logs",
      description:
        "Logged or auto-detected exercise sessions — activity name, duration, calories, distance, average HR.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getExerciseLogs(start, end);
      },
    },

    // -----------------------------------------------------------------
    // Overnight vitals / recovery signals
    // -----------------------------------------------------------------
    {
      path: "/spo2",
      summary: "Daily SpO2 (blood oxygen)",
      description:
        "Per-day blood-oxygen saturation — nightly average plus min and max (percent). A drop in the nightly minimum can indicate respiratory disturbance or illness.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getSpo2(start, end);
      },
    },
    {
      path: "/breathing-rate",
      summary: "Daily breathing rate",
      description:
        "Per-day average breathing rate (breaths per minute) measured during sleep. A sustained rise above baseline is an early illness / under-recovery signal.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getBreathingRate(start, end);
      },
    },
    {
      path: "/skin-temp",
      summary: "Daily skin temperature deviation",
      description:
        "Per-day nightly skin-temperature deviation from the user's personal baseline (degrees; positive = warmer than baseline). Multi-night positive deviation is part of the standard illness / over-training triad.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getSkinTemp(start, end);
      },
    },
    {
      path: "/cardio-score",
      summary: "Cardio fitness (VO2 max)",
      description:
        "Historical per-day cardio-fitness score (VO2 max) from the retired Fitbit Web API. Stored as a RANGE string such as \"43-47\", not a single number; Google Health currently supplies no replacement points.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getCardioScore(start, end);
      },
    },
    {
      path: "/eight-sleep",
      summary: "Eight Sleep nightly data",
      description:
        "Per-main-session Eight Sleep mattress data: sleep score, time asleep and stage minutes (deep/light/REM), average sleeping heart rate, HRV (RMSSD), respiratory rate, bed/room temperature, and toss-and-turn count. `date` is the America/New_York local wake date. This is a complementary contact-sensor source, not an automatic replacement for the Fitbit wearable; use sensor-agreement for like-date comparisons.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getEightSleep(start, end);
      },
    },
    {
      path: "/sensor-agreement",
      summary: "Fitbit and Eight Sleep agreement",
      description:
        "Pairs Fitbit-device measurements imported through Google Health with Eight Sleep on the same America/New_York local wake date. Reports overlap, evidence maturity, rolling correlation, relative-trend alignment, isolated or sustained divergence, session context, measurement definitions, regimes, and largest-divergence nights. Heart-rate values are related but explicitly non-comparable definitions; agreement is not a sensor-accuracy verdict.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getSensorAgreement(start, end, ctx.userTimezone);
      },
    },
    {
      path: "/food",
      summary: "Daily food / calorie intake",
      description:
        "Per-day logged nutrition rolled up from Google Health: total calories in, macronutrients in grams (carbs, sugar, fat, saturated fat, fiber, protein), and minerals in milligrams (sodium, cholesterol, potassium), plus how many items were logged. Water and calorie-goal are not provided by Google Health (null since the 2026-06 cutover). Only days the user actually logged food appear — absence means nothing was logged, not zero intake. Pair with activity/calories-out for energy balance.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getFood(start, end);
      },
    },
    {
      path: "/nutrition-weight",
      summary: "Nutrition, energy, training, and weight report",
      description:
        "Coverage-aware local-day report joining logged nutrition, estimated wearable calories out, training load, and raw plus seven-day-median weight. Missing food stays unknown rather than zero. The current local date is provisional, and long-window readiness requires 42 completed span days, 30 food-logged days, and 18 weight dates. Estimated energy gap is not a measured physiological deficit and the report does not claim calories caused weight change.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getNutritionWeight(
          start,
          end,
          todayInTz(ctx.userTimezone),
        );
      },
    },

    {
      path: "/training-load",
      summary: "Training load and exercise type",
      description:
        "Step-independent effort. Per-day training load (heart-rate-weighted duration, Banister TRIMP) plus every session classified as strength / cardio / walk / chore. USE THIS, not steps, to judge whether the user actually trained: resistance work produces no steps at all, so a step count of zero can still be a hard session. `load` is a self-relative index — compare the user's days to each other, never to an absolute standard, and note it assumes a maximum heart rate. Sessions flagged `estimated` had no heart rate and used a fallback intensity.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.trainingService.getSummary(start, end);
      },
    },

    {
      path: "/readiness",
      summary: "Readiness / recovery score",
      description:
        "Versioned personal recovery score (0-100, 50 = personal baseline) synthesized from Fitbit/Google Health and Eight Sleep signals: HRV, resting/sleeping HR, sleep, breathing rate, SpO2, and skin-temperature deviation. Returns definitions, source/regime metadata, per-signal breakdown, and history. Treat the current local date as provisional when still in progress.",
      handler: async (_args, ctx) => ctx.healthDataService.getReadiness(),
    },
    {
      path: "/recovery-anomalies",
      summary: "Explainable unusual recovery days",
      description:
        "Completed local wake dates whose recovery signals differ materially from their own robust, weekday-aware trailing baselines. Every result includes contributing signals, source/regime provenance, coverage, and direction. Scores measure unusualness, not health risk, and are not diagnostic.",
      parameters: dateRangeParams,
      handler: async (args, ctx) => {
        const { start, end } = resolveDateRange(args, ctx.userTimezone);
        return ctx.healthDataService.getRecoveryAnomalies(
          start,
          end,
          todayInTz(ctx.userTimezone),
        );
      },
    },

    // -----------------------------------------------------------------
    // Aggregates / analytics
    // -----------------------------------------------------------------
    {
      path: "/insights/weekly",
      summary: "Weekly insights",
      description:
        "Week-over-week deltas for activity, sleep, and heart rate plus weekday patterns and narrative call-outs. Uses completed local days only and excludes the in-progress current date.",
      handler: async (_args, ctx) =>
        ctx.healthDataService.getWeeklyInsights(todayInTz(ctx.userTimezone)),
    },
    {
      path: "/records",
      summary: "Personal records and streaks",
      description:
        "All-time bests across the dataset and current / best consecutive-day streaks. The current streak walker treats today's in-progress row as 'data not yet in' rather than a streak failure.",
      handler: async (_args, ctx) =>
        ctx.healthDataService.getRecords(todayInTz(ctx.userTimezone)),
    },
    {
      path: "/correlations",
      summary: "Cross-metric correlations",
      description:
        "Pearson r for curated metric pairs over completed local days — activity (steps, active minutes), sleep (duration, deep), resting HR, HRV, calorie intake, Eight Sleep restlessness, Tesla time-in-car, and readiness. The current date is excluded; sleep and HRV are restricted to their latest measurementMethod regimes. lagDays=1 compares X on day D with wake-dated overnight Y on D+1 (that night), or readiness the next morning. A pair needs 10+ overlapping days. Associations are hypothesis-generating, not causal. Food pairs include logged days only; no-drive days count as zero within the tracked span.",
      handler: async (_args, ctx) =>
        ctx.healthDataService.getCorrelations(todayInTz(ctx.userTimezone)),
    },
    {
      path: "/heatmap/day-of-week",
      summary: "Day-of-week heatmap",
      description:
        "Per-day-of-week averages for each tracked metric — a calendar pattern view of how metrics drift across Mon–Sun.",
      handler: async (_args, ctx) =>
        ctx.healthDataService.getDayOfWeekHeatmap(todayInTz(ctx.userTimezone)),
    },

    // -----------------------------------------------------------------
    // Supplements
    // -----------------------------------------------------------------
    {
      path: "/supplements/items",
      summary: "Supplement library",
      description: "All supplement items in the user's library with their default dose, unit, and ingredient breakdown.",
      parameters: {
        type: "object",
        properties: {
          includeInactive: {
            type: "boolean",
            description: "Include archived items.",
            default: false,
          },
        },
      },
      handler: async (args, ctx) =>
        ctx.supplementService.listItems(Boolean(args.includeInactive)),
    },
    {
      path: "/supplements/intakes",
      summary: "Supplement intakes",
      description:
        "Per-intake log rows for supplements taken in the requested window. Useful for joining with health metrics by date.",
      parameters: {
        type: "object",
        properties: {
          start: { type: "string", description: "Start date YYYY-MM-DD." },
          end: { type: "string", description: "End date YYYY-MM-DD." },
          itemId: { type: "integer", description: "Optional: filter to a specific supplement item id." },
        },
      },
      handler: async (args, ctx) => {
        const start = typeof args.start === "string" ? args.start : undefined;
        const end = typeof args.end === "string" ? args.end : undefined;
        const itemId = asId(args.itemId);
        return ctx.supplementService.listIntakes(
          start,
          end,
          itemId ?? undefined,
        );
      },
    },
    {
      path: "/supplements/adherence",
      summary: "Supplement adherence",
      description:
        "Daily intake counts, current and best streaks, and by-day-of-week averages for one supplement item over a window.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "integer", description: "Supplement item id." },
          start: { type: "string", description: "Start date YYYY-MM-DD. Defaults to 90 days ago." },
          end: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
        },
        required: ["itemId"],
      },
      handler: async (args, ctx) => {
        const itemId = asId(args.itemId);
        if (itemId == null) throw new Error("itemId required");
        const today = todayInTz(ctx.userTimezone);
        const start = typeof args.start === "string" ? args.start : addDays(today, -90);
        const end = typeof args.end === "string" ? args.end : today;
        return ctx.analyticsService.getSupplementAdherence(itemId, start, end);
      },
    },
    {
      path: "/supplements/correlations",
      summary: "Supplement → health correlations",
      description:
        "Pearson r between an item's daily-taken signal and each health metric (steps, sleep, deep, RHR, HRV). Set lag=1 to compare today's metric vs yesterday's intake.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "integer", description: "Supplement item id." },
          lag: {
            type: "integer",
            description: "Days to shift intake back relative to metric (0–7). 0 = same day; 1 = yesterday's intake vs today's metric.",
            default: 0,
          },
        },
        required: ["itemId"],
      },
      handler: async (args, ctx) => {
        const itemId = asId(args.itemId);
        if (itemId == null) throw new Error("itemId required");
        const lag = Math.max(0, Math.min(7, asInt(args.lag, 0)));
        return ctx.analyticsService.getSupplementCorrelations(itemId, lag);
      },
    },

    // -----------------------------------------------------------------
    // Medications
    // -----------------------------------------------------------------
    {
      path: "/medications/items",
      summary: "Medication library",
      description: "All medication items in the user's library.",
      parameters: {
        type: "object",
        properties: {
          includeInactive: {
            type: "boolean",
            description: "Include archived items.",
            default: false,
          },
        },
      },
      handler: async (args, ctx) =>
        ctx.medicationService.listItems(Boolean(args.includeInactive)),
    },
    {
      path: "/medications/intakes",
      summary: "Medication intakes",
      description: "Per-intake log rows for medications taken in the requested window.",
      parameters: {
        type: "object",
        properties: {
          start: { type: "string", description: "Start date YYYY-MM-DD." },
          end: { type: "string", description: "End date YYYY-MM-DD." },
          itemId: { type: "integer", description: "Optional: filter to a specific medication id." },
        },
      },
      handler: async (args, ctx) => {
        const start = typeof args.start === "string" ? args.start : undefined;
        const end = typeof args.end === "string" ? args.end : undefined;
        const itemId = asId(args.itemId);
        return ctx.medicationService.listIntakes(
          start,
          end,
          itemId ?? undefined,
        );
      },
    },
    {
      path: "/medications/adherence",
      summary: "Medication adherence",
      description:
        "Daily intake counts, current and best streaks, and by-day-of-week averages for one medication over a window.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "integer", description: "Medication id." },
          start: { type: "string", description: "Start date YYYY-MM-DD. Defaults to 90 days ago." },
          end: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
        },
        required: ["itemId"],
      },
      handler: async (args, ctx) => {
        const itemId = asId(args.itemId);
        if (itemId == null) throw new Error("itemId required");
        const today = todayInTz(ctx.userTimezone);
        const start = typeof args.start === "string" ? args.start : addDays(today, -90);
        const end = typeof args.end === "string" ? args.end : today;
        return ctx.analyticsService.getMedicationAdherence(itemId, start, end);
      },
    },
    {
      path: "/medications/correlations",
      summary: "Medication → health correlations",
      description:
        "Pearson r between a medication's daily-taken signal and each health metric, with optional day lag.",
      parameters: {
        type: "object",
        properties: {
          itemId: { type: "integer", description: "Medication id." },
          lag: {
            type: "integer",
            description: "Days to shift intake back relative to metric (0–7).",
            default: 0,
          },
        },
        required: ["itemId"],
      },
      handler: async (args, ctx) => {
        const itemId = asId(args.itemId);
        if (itemId == null) throw new Error("itemId required");
        const lag = Math.max(0, Math.min(7, asInt(args.lag, 0)));
        return ctx.analyticsService.getMedicationCorrelations(itemId, lag);
      },
    },
  ];
}
