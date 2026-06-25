import { useEffect, useMemo, useState } from "react";
import type { LlmModelSettings, LlmTask } from "@health-dashboard/shared";
import {
  useLlmModelSettings,
  useUpdateLlmModelSettings,
} from "../api/queries";

const MODEL_OPTIONS = [
  { value: "opus", label: "Opus", blurb: "Most capable · slowest" },
  { value: "sonnet", label: "Sonnet", blurb: "Balanced · the default" },
  { value: "haiku", label: "Haiku", blurb: "Fastest · lightest" },
];

const TASKS: { key: LlmTask; label: string; desc: string }[] = [
  {
    key: "insights",
    label: "Weekly Insights",
    desc: "Deep multi-tool analysis — Opus earns its keep here.",
  },
  {
    key: "chat",
    label: "Chat",
    desc: "Interactive Q&A about your data — favour a faster model.",
  },
  {
    key: "dossier",
    label: "Supplement / Med Dossiers",
    desc: "On-demand reference docs.",
  },
];

const selectClass =
  "w-full rounded-lg bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary";

/**
 * Per-task Claude model picker. Heavier tasks can run on Opus while
 * interactive ones stay fast — same flat-rate subscription, so the only
 * trade-off is quality vs latency. Resolved server-side at call time, so
 * a change here takes effect on the next AI run without a redeploy.
 */
export function LlmModelSettingsCard() {
  const query = useLlmModelSettings();
  const update = useUpdateLlmModelSettings();
  const [draft, setDraft] = useState<LlmModelSettings | null>(null);

  // Seed/refresh the local draft whenever the server value arrives.
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const dirty = useMemo(
    () =>
      draft != null &&
      query.data != null &&
      (Object.keys(draft) as LlmTask[]).some((k) => draft[k] !== query.data![k]),
    [draft, query.data],
  );

  function optionsForTask(task: LlmTask) {
    // Keep a stored full id (e.g. claude-sonnet-4-6) selectable even after
    // the user switches that dropdown to an alias — derive the custom
    // option from BOTH the persisted and the current draft value, so a
    // stored id stays reachable until a different choice is actually saved.
    const extras = new Set<string>();
    for (const v of [query.data?.[task], draft?.[task]]) {
      if (v && !MODEL_OPTIONS.some((o) => o.value === v)) extras.add(v);
    }
    return [
      ...[...extras].map((v) => ({ value: v, label: v, blurb: "custom id" })),
      ...MODEL_OPTIONS,
    ];
  }

  return (
    <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
      <header className="mb-5">
        <h3 className="font-headline text-xl font-bold text-on-surface">
          AI Models
        </h3>
        <p className="text-outline text-sm">
          Which Claude model runs each AI task. Same flat-rate subscription —
          the trade-off is quality vs speed.
        </p>
      </header>

      {query.isLoading || !draft ? (
        <p className="text-sm text-outline">Loading…</p>
      ) : (
        <div className="space-y-4">
          {TASKS.map((task) => {
            const opts = optionsForTask(task.key);
            return (
              <label key={task.key} className="block">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-on-surface">
                    {task.label}
                  </span>
                  <span className="text-[11px] text-outline">
                    {opts.find((o) => o.value === draft[task.key])?.blurb}
                  </span>
                </div>
                <select
                  value={draft[task.key]}
                  onChange={(e) => {
                    setDraft({ ...draft, [task.key]: e.target.value });
                    update.reset(); // clear a prior "Saved ✓" once editing resumes
                  }}
                  className={selectClass}
                  aria-label={`Model for ${task.label}`}
                >
                  {opts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-outline mt-1">{task.desc}</p>
              </label>
            );
          })}

          <div className="flex items-center justify-end gap-3 pt-1">
            {update.isSuccess && !dirty && (
              <span className="text-xs text-secondary">Saved ✓</span>
            )}
            {update.isError && (
              <span className="text-xs text-error">Save failed</span>
            )}
            <button
              onClick={() => draft && update.mutate(draft)}
              disabled={!dirty || update.isPending}
              className="px-5 py-2 text-xs font-bold rounded-lg bg-primary text-on-primary-fixed disabled:opacity-40 transition-opacity"
            >
              {update.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
