import { useMemo, useState } from "react";
import type { LlmModelSettings, LlmTask } from "@health-dashboard/shared";
import { useLlmModelSettings, useUpdateLlmModelSettings } from "../api/queries";

const MODEL_OPTIONS = [
  { value: "opus", label: "Opus", blurb: "Most capable · slowest" },
  { value: "sonnet", label: "Sonnet", blurb: "Balanced · the default" },
  { value: "haiku", label: "Haiku", blurb: "Fastest · lightest" },
];

const TASKS: { key: LlmTask; label: string; desc: string }[] = [
  { key: "insights", label: "Weekly Insights", desc: "Deep multi-tool analysis." },
  { key: "chat", label: "Chat", desc: "Interactive questions about your data." },
  { key: "dossier", label: "Supplement / Med Dossiers", desc: "On-demand supplement and medication references." },
];

const selectClass =
  "w-full rounded-lg bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/60";

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
      <header className="mb-5">
        <h3 className="font-headline text-xl font-bold text-on-surface">AI models</h3>
        <p className="text-on-surface-variant text-sm mt-1">
          Choose quality versus speed independently for each task.
        </p>
      </header>
      {children}
    </section>
  );
}

function ModelSettingsForm({ initial }: { initial: LlmModelSettings }) {
  const update = useUpdateLlmModelSettings();
  const [draft, setDraft] = useState(initial);
  const dirty = useMemo(
    () => (Object.keys(draft) as LlmTask[]).some((key) => draft[key] !== initial[key]),
    [draft, initial],
  );

  const optionsForTask = (task: LlmTask) => {
    const extras = new Set([initial[task], draft[task]]);
    return [
      ...[...extras]
        .filter((value) => !MODEL_OPTIONS.some((option) => option.value === value))
        .map((value) => ({ value, label: value, blurb: "Custom model ID" })),
      ...MODEL_OPTIONS,
    ];
  };

  return (
    <div className="space-y-4">
      {TASKS.map((task) => {
        const options = optionsForTask(task.key);
        return (
          <label key={task.key} className="block">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-sm font-semibold text-on-surface">{task.label}</span>
              <span className="text-xs text-outline">
                {options.find((option) => option.value === draft[task.key])?.blurb}
              </span>
            </div>
            <select
              value={draft[task.key]}
              onChange={(event) => {
                setDraft({ ...draft, [task.key]: event.target.value });
                update.reset();
              }}
              className={selectClass}
              aria-label={`Model for ${task.label}`}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="text-xs text-outline mt-1">{task.desc}</p>
          </label>
        );
      })}

      <div className="flex items-center justify-end gap-3 pt-1">
        {update.isSuccess && !dirty && <span className="text-xs text-secondary">Saved</span>}
        {update.isError && <span className="text-xs text-error">Save failed</span>}
        <button
          onClick={() => update.mutate(draft)}
          disabled={!dirty || update.isPending}
          className="px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-on-primary disabled:opacity-40 transition-opacity"
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

export function LlmModelSettingsCard() {
  const query = useLlmModelSettings();
  return (
    <CardShell>
      {query.isLoading && <p className="text-sm text-outline">Loading settings…</p>}
      {query.isError && <p role="alert" className="text-sm text-error">Couldn’t load AI model settings.</p>}
      {query.data && (
        <ModelSettingsForm key={JSON.stringify(query.data)} initial={query.data} />
      )}
    </CardShell>
  );
}
