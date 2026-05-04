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
  requiredTools: string[];
  prompt: string;
}

const HEALTH_CATEGORIES: CategoryDef[] = [
  {
    key: "activity",
    title: "Activity & Movement",
    color: "#c0c1ff",
    requiredTools: ["query_activity", "query_records", "query_heatmap_day_of_week"],
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

    const tools = buildHealthTools().map((t) => t.toolDef);

    const results = await Promise.allSettled(
      HEALTH_CATEGORIES.map(async (cat) => {
        try {
          const result = await runAgenticLoop({
            llm: this.llm,
            model: this.opts.model,
            messages: [
              {
                role: "system",
                content: this.buildSystemPrompt(cat, dateFrom, dateTo),
              },
              {
                role: "user",
                content:
                  `Analyse my ${cat.title.toLowerCase()} for the window ` +
                  `${dateFrom} to ${dateTo}. Use the registered tools to ` +
                  `pull real numbers; do not fabricate.`,
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
      }),
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

  private buildSystemPrompt(
    cat: CategoryDef,
    dateFrom: string,
    dateTo: string,
  ): string {
    return [
      cat.prompt,
      "",
      `Window for analysis: ${dateFrom} → ${dateTo}.`,
      "",
      GROUNDING_RULES,
    ].join("\n");
  }
}
