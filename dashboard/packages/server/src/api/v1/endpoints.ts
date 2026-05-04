import type { HealthDataService } from "../../services/healthDataService.js";
import type { AnalyticsService } from "../../services/analyticsService.js";
import type { SupplementService } from "../../services/supplementService.js";
import type { MedicationService } from "../../services/medicationService.js";
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
  analyticsService: AnalyticsService;
  supplementService: SupplementService;
  medicationService: MedicationService;
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
        "Per-day sleep totals, stages (deep / REM / light / awake), efficiency, and bedtime / wake-time instants.",
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
        "Per-day heart-rate variability (RMSSD) — daily, deep-sleep, and REM-sleep values.",
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
    // Aggregates / analytics
    // -----------------------------------------------------------------
    {
      path: "/insights/weekly",
      summary: "Weekly insights",
      description:
        "Week-over-week deltas for activity, sleep, and heart rate plus narrative call-outs (e.g. step trend, sleep consistency).",
      handler: async (_args, ctx) => ctx.healthDataService.getWeeklyInsights(),
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
        "Pearson r between every pair of metric series (steps, sleep, deep sleep, resting HR, daily RMSSD) over the joined day grain.",
      handler: async (_args, ctx) => ctx.healthDataService.getCorrelations(),
    },
    {
      path: "/heatmap/day-of-week",
      summary: "Day-of-week heatmap",
      description:
        "Per-day-of-week averages for each tracked metric — a calendar pattern view of how metrics drift across Mon–Sun.",
      handler: async (_args, ctx) =>
        ctx.healthDataService.getDayOfWeekHeatmap(),
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
