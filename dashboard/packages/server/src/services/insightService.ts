import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";
import type { V1Context } from "../api/v1/endpoints.js";
import type { InsightRepository } from "../repositories/insightRepo.js";
import { GROUNDING_RULES } from "./groundingRules.js";
import {
  buildHealthTools,
  executeHealthTool,
} from "./healthTools.js";
import { addDays, todayInTz } from "./userTz.js";
import type { LlmClient } from "./llmClient.js";
import {
  runAgenticLoop,
  type AgenticProgressEvent,
} from "./agenticLoop.js";

// ---------------------------------------------------------------------------
// Categories — one per analytical dimension
// ---------------------------------------------------------------------------

export interface CategoryDef {
  key: string;
  title: string;
  /** Per-category accent for the UI accordion. */
  color: string;
  /** Tools the loop FORCES the model to call before accepting an answer. */
  requiredTools: string[];
  /**
   * Full set of tools the model is allowed to use in this category.
   * Defaults to `requiredTools`. Keeping this a small (~4-7) curated
   * list per category, rather than passing all 19 tools every time,
   * matters for two reasons:
   *
   *   1. The local Claude proxy shell-marshals tool definitions to
   *      `claude -p --tools …`, which fails (HTTP 500, empty `--tools`
   *      arg in the error) when the marshalled string is too long.
   *      Smaller list = smaller argv = call succeeds.
   *   2. Models pick more accurate tools when the choice space is
   *      narrowed to obviously-relevant ones rather than the kitchen
   *      sink.
   */
  relevantTools?: string[];
  prompt: string;
}

const HEALTH_CATEGORIES: CategoryDef[] = [
  {
    key: "activity",
    title: "Activity & Movement",
    color: "#c0c1ff",
    requiredTools: ["query_activity", "query_records", "query_heatmap_day_of_week"],
    relevantTools: [
      "query_activity",
      "query_records",
      "query_heatmap_day_of_week",
      "query_exercise_logs",
      "query_summary",
    ],
    prompt:
      "You are a personal health coach analysing the user's daily activity " +
      "(steps, distance, active minutes, exercise sessions). Cover: trend " +
      "vs the prior period, day-of-week patterns, distance from the user's " +
      "personal records, and a single concrete suggestion. Use markdown " +
      "with bold figures and a short bullet list. 200-300 words.",
  },
  {
    key: "sleep",
    title: "Sleep & Recovery",
    color: "#4edea3",
    requiredTools: ["query_sleep", "query_hrv", "query_records"],
    relevantTools: [
      "query_sleep",
      "query_hrv",
      "query_records",
      "query_correlations",
      "query_summary",
    ],
    prompt:
      "Analyse the user's sleep duration, stage breakdown (deep / REM / " +
      "light), efficiency, bedtime consistency, and HRV as a recovery " +
      "indicator. Note any nights below 7 hours, deep-sleep trends, and " +
      "whether HRV correlates with sleep totals. End with one specific " +
      "behaviour to test. 200-300 words, markdown.",
  },
  {
    key: "cardiovascular",
    title: "Cardiovascular",
    color: "#ffb2b7",
    requiredTools: ["query_heart_rate", "query_hrv", "query_summary"],
    relevantTools: [
      "query_heart_rate",
      "query_hrv",
      "query_summary",
      "query_records",
    ],
    prompt:
      "Analyse resting heart rate, heart-rate-zone minutes, and HRV. Call " +
      "out the recent RHR trend (rising / falling / stable), how much time " +
      "the user spent in fat-burn / cardio / peak zones, and whether HRV " +
      "looks normal for their baseline. 200-300 words, markdown.",
  },
  {
    key: "body_composition",
    title: "Body Composition",
    color: "#c0c1ff",
    requiredTools: ["query_weight", "query_summary"],
    relevantTools: ["query_weight", "query_summary", "query_activity"],
    prompt:
      "Analyse the user's weight trajectory. Cover: window over which " +
      "data is available, total change in kg, weekly rate, and any " +
      "plateaus or accelerations. If only sparse weights are logged, say " +
      "so plainly — do not extrapolate. 150-250 words, markdown.",
  },
  {
    key: "lifestyle",
    title: "Supplements & Medications",
    color: "#4edea3",
    requiredTools: ["query_supplements_items", "query_medications_items"],
    relevantTools: [
      "query_supplements_items",
      "query_supplements_intakes",
      "query_supplements_adherence",
      "query_supplements_correlations",
      "query_medications_items",
      "query_medications_intakes",
      "query_medications_adherence",
    ],
    prompt:
      "Survey what the user is currently taking — both supplements and " +
      "medications. For each item with at least 7 logged intakes, briefly " +
      "report adherence (current streak, days taken vs days in window). " +
      "If the user has logged correlations, mention any that look strong " +
      "(|r| ≥ 0.3). Keep it factual; don't recommend doses. 200-300 " +
      "words, markdown.",
  },
  {
    key: "trends",
    title: "Records & Trends",
    color: "#ffb2b7",
    requiredTools: [
      "query_records",
      "query_correlations",
      "query_insights_weekly",
    ],
    relevantTools: [
      "query_records",
      "query_correlations",
      "query_insights_weekly",
      "query_summary",
      "query_heatmap_day_of_week",
    ],
    prompt:
      "Surface the user's all-time personal records, current streaks, " +
      "week-over-week deltas, and the strongest cross-metric correlations " +
      "(steps↔sleep, sleep↔HRV, etc.). Highlight what's improving, what's " +
      "regressing, and one correlation worth investigating. 200-300 words, " +
      "markdown.",
  },
];

export function listCategoryDefs(): CategoryDef[] {
  return HEALTH_CATEGORIES;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface GenerateInsightsOptions {
  dateFrom?: string;
  dateTo?: string;
  /** Optional progress callback per category. */
  onCategoryProgress?: (
    categoryKey: string,
    event: AgenticProgressEvent,
  ) => void;
}

export interface GeneratedCategory {
  key: string;
  title: string;
  content: string;
  toolsCalled: string[];
  rounds: number;
  placeholder: boolean;
  error?: string;
}

export interface GenerateInsightsResult {
  generationId: string;
  dateFrom: string;
  dateTo: string;
  categories: GeneratedCategory[];
}

export class InsightService {
  constructor(
    private repo: InsightRepository,
    private llm: LlmClient,
    private v1Ctx: V1Context,
    private opts: { model: string },
  ) {}

  async generate(
    options: GenerateInsightsOptions = {},
  ): Promise<GenerateInsightsResult> {
    const tz = this.v1Ctx.userTimezone;
    const today = todayInTz(tz);
    const dateTo = options.dateTo ?? today;
    const dateFrom = options.dateFrom ?? addDays(today, -90);
    const generationId = randomUUID();
    const allTools = buildHealthTools();

    // Run categories with bounded concurrency. Six concurrent
    // `claude -p` subprocess invocations were overwhelming the local
    // proxy (some completions returned 500 with an empty `--tools`
    // argv). Three at a time keeps the proxy happy and total wall
    // time roughly the same since each category is mostly waiting on
    // upstream model responses.
    const results = await runWithConcurrency(
      HEALTH_CATEGORIES,
      3,
      async (cat) => {
        // Per-category curated tool list. Defaults to requiredTools
        // when relevantTools is omitted. Smaller list = smaller argv
        // payload to the proxy AND a more focused tool space for the
        // model.
        const allowed = new Set(cat.relevantTools ?? cat.requiredTools);
        const tools = allTools
          .filter((t) => allowed.has(t.name))
          .map((t) => t.toolDef);

        try {
          const result = await runAgenticLoop({
            llm: this.llm,
            model: this.opts.model,
            messages: [
              // System prompt stays SHORT — proxies that shell-marshal
              // it via `--system-prompt "..."` reliably break with long
              // payloads. Bulk reference text (the grounding rules)
              // moves to the first user message.
              { role: "system", content: cat.prompt },
              {
                role: "user",
                content: this.buildUserPrompt(cat, dateFrom, dateTo),
              },
            ],
            tools,
            requiredTools: cat.requiredTools,
            executeTool: (name, args) =>
              executeHealthTool(name, args, this.v1Ctx),
            maxRounds: 10,
            maxNags: 2,
            task: "insights",
            temperature: 0.3,
            onProgress: (e) => options.onCategoryProgress?.(cat.key, e),
          });

          await this.repo.insertCategoryRow({
            generationId,
            category: cat.key,
            title: cat.title,
            content: result.content,
            dateFrom,
            dateTo,
          });

          return {
            key: cat.key,
            title: cat.title,
            content: result.content,
            toolsCalled: result.toolsCalled,
            rounds: result.rounds,
            placeholder: result.placeholder,
          };
        } catch (err) {
          logger.error(
            { err, category: cat.key },
            "Insight category generation failed",
          );
          const errMessage = (err as Error).message;
          const placeholder = `_Unable to generate ${cat.title} analysis._ ${errMessage}`;
          await this.repo.insertCategoryRow({
            generationId,
            category: cat.key,
            title: cat.title,
            content: placeholder,
            dateFrom,
            dateTo,
          });
          return {
            key: cat.key,
            title: cat.title,
            content: placeholder,
            toolsCalled: [],
            rounds: 0,
            placeholder: true,
            error: errMessage,
          };
        }
      },
    );

    const categories: GeneratedCategory[] = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      const cat = HEALTH_CATEGORIES[i];
      return {
        key: cat.key,
        title: cat.title,
        content: `_Generation failed for ${cat.title}._`,
        toolsCalled: [],
        rounds: 0,
        placeholder: true,
        error: (r.reason as Error).message,
      };
    });

    return { generationId, dateFrom, dateTo, categories };
  }

  private buildUserPrompt(
    cat: CategoryDef,
    dateFrom: string,
    dateTo: string,
  ): string {
    return [
      `Analyse my ${cat.title.toLowerCase()} for the window ${dateFrom} → ${dateTo}.`,
      `Use the registered tools to pull real numbers; do not fabricate.`,
      "",
      GROUNDING_RULES,
    ].join("\n");
  }
}

// ---------------------------------------------------------------------------
// Bounded-concurrency Promise.allSettled — keeps the local Claude proxy
// from being saturated by N parallel `claude -p` invocations.
// ---------------------------------------------------------------------------

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;
  const workers: Promise<void>[] = [];
  const workerCount = Math.max(1, Math.min(limit, items.length));
  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = nextIndex++;
          if (i >= items.length) return;
          try {
            const value = await fn(items[i]);
            results[i] = { status: "fulfilled", value };
          } catch (reason) {
            results[i] = { status: "rejected", reason };
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}
