import { useState } from "react";
import type { InsightCategory, InsightJob } from "@health-dashboard/shared";
import { DEFAULT_SERIES, SERIES } from "../charts/chartPalette";
import { MarkdownBody } from "./MarkdownBody";
import { useInsightReports } from "./useInsightReports";

export function ReportsTab() {
  const reports = useInsightReports();

  const onDelete = async () => {
    if (!reports.activeSummary) return;
    if (
      !window.confirm(
        `Delete this analysis from ${reports.activeSummary.createdAt.slice(0, 10)}?`,
      )
    ) {
      return;
    }
    await reports.deleteActive();
  };

  return (
    <div className="space-y-4">
      {reports.inFlight && reports.job && <ProgressCard job={reports.job} />}

      {!reports.inFlight && reports.job?.status === "failed" && (
        <div className="bg-error/10 border border-error/30 rounded-xl p-4 text-sm text-error">
          Generation failed: {reports.job.error ?? "unknown error"}
        </div>
      )}

      <header className="bg-surface-container rounded-xl p-5 border border-outline-variant/10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm text-on-surface">
          {reports.activeSummary ? (
            <>
              <span className="font-bold">
                {new Date(reports.activeSummary.createdAt).toLocaleString()}
              </span>
              <span className="ml-2 inline-block text-[10px] uppercase tracking-widest font-bold text-outline bg-surface-container-low px-2 py-0.5 rounded">
                {reports.activeSummary.dateFrom} → {reports.activeSummary.dateTo}
              </span>
            </>
          ) : reports.isLoading ? (
            <span className="text-outline">Loading analyses…</span>
          ) : (
            <span className="text-outline">
              No analyses yet — click Regenerate to create the first.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {reports.generations.length > 0 && (
            <>
              <button
                onClick={reports.selectOlder}
                disabled={
                  reports.resolvedIndex >= reports.generations.length - 1
                }
                aria-label="Older analysis"
                className="p-1 text-outline hover:text-on-surface disabled:opacity-30"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <span className="text-xs tabular-nums text-outline">
                {reports.resolvedIndex + 1} / {reports.generations.length}
              </span>
              <button
                onClick={reports.selectNewer}
                disabled={reports.resolvedIndex === 0}
                aria-label="Newer analysis"
                className="p-1 text-outline hover:text-on-surface disabled:opacity-30"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </>
          )}
          <button
            onClick={reports.regenerate}
            disabled={reports.inFlight || reports.isStarting}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary-fixed rounded-lg text-sm font-bold disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">
              {reports.inFlight ? "hourglass_empty" : "auto_awesome"}
            </span>
            {reports.inFlight ? "Generating…" : "Regenerate"}
          </button>
          {reports.activeSummary && (
            <button
              onClick={onDelete}
              aria-label="Delete this analysis"
              className="p-2 text-outline hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined">delete</span>
            </button>
          )}
        </div>
      </header>

      {!reports.inFlight && reports.detail && (
        <CategoryAccordion categories={reports.detail.categories} />
      )}

      {!reports.detail &&
        !reports.isLoading &&
        reports.generations.length === 0 &&
        !reports.inFlight && (
          <EmptyReport onGenerate={reports.regenerate} />
        )}
    </div>
  );
}

function EmptyReport({ onGenerate }: { onGenerate: () => Promise<void> }) {
  return (
    <div className="bg-surface-container rounded-xl p-12 text-center border border-outline-variant/10">
      <div className="text-outline mb-4">
        <span
          className="material-symbols-outlined text-5xl"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
      </div>
      <p className="text-on-surface-variant mb-4">
        No analyses yet. Generate the first one to see what's been happening
        with your activity, sleep, recovery, and lifestyle.
      </p>
      <button
        onClick={onGenerate}
        className="px-6 py-2.5 bg-primary text-on-primary-fixed rounded-lg text-sm font-bold"
      >
        Generate First Analysis
      </button>
    </div>
  );
}

function ProgressCard({ job }: { job: InsightJob }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-surface-container rounded-xl p-5 border border-outline-variant/10"
    >
      <div className="flex items-center gap-3 mb-3">
        <span
          className="material-symbols-outlined text-primary animate-pulse"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
        <div className="flex-1">
          <div className="font-bold text-on-surface">
            Analyzing your health data
          </div>
          <div className="text-xs text-outline">
            Started {new Date(job.startedAt).toLocaleTimeString()}
          </div>
        </div>
        <div className="text-sm font-bold tabular-nums text-primary">
          {job.progress}%
        </div>
      </div>
      <div
        className="h-2 bg-surface-container-lowest rounded-full overflow-hidden mb-2"
        aria-label={`Progress: ${job.progress}%`}
      >
        <div
          className="h-full bg-primary rounded-full transition-[width] duration-500"
          style={{ width: `${job.progress}%` }}
        />
      </div>
      <div className="text-xs text-outline">{job.statusMessage}</div>
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  activity: SERIES[0],
  sleep: SERIES[1],
  cardiovascular: SERIES[2],
  body_composition: SERIES[3],
  lifestyle: SERIES[4],
  trends: SERIES[5],
};

function CategoryAccordion({ categories }: { categories: InsightCategory[] }) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(categories.length > 0 ? [categories[0].key] : []),
  );

  return (
    <div className="space-y-2">
      {categories.map((category) => {
        const isOpen = open.has(category.key);
        const color = CATEGORY_COLORS[category.key] ?? DEFAULT_SERIES;
        return (
          <div
            key={category.key}
            className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden"
          >
            <button
              onClick={() => {
                const next = new Set(open);
                if (isOpen) next.delete(category.key);
                else next.add(category.key);
                setOpen(next);
              }}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high transition-colors text-left"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: color }}
              />
              <span className="flex-1 font-headline font-semibold text-on-surface">
                {category.title}
              </span>
              <span
                className={`material-symbols-outlined text-outline transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              >
                expand_more
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 text-sm text-on-surface markdown-body">
                <MarkdownBody>{category.content}</MarkdownBody>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
