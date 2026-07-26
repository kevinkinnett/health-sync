import { useState } from "react";
import type {
  CreateInterventionBody,
  InterventionCategory,
  InterventionKind,
} from "@health-dashboard/shared";
import { useCreateIntervention } from "../../api/queries";

/**
 * Add a change the app cannot infer — a device arriving, a programme
 * starting, a diet change.
 *
 * The kind selector is the one bit of real UX here: an `event` is a point
 * in time and a `period` is a span, so the end-date field only exists for
 * a period. The server enforces the same rule; hiding the field keeps the
 * user from hitting that error in the first place.
 */

const CATEGORIES: { value: InterventionCategory; label: string }[] = [
  { value: "device", label: "Device" },
  { value: "medication", label: "Medication" },
  { value: "supplement", label: "Supplement" },
  { value: "training", label: "Training" },
  { value: "diet", label: "Diet" },
  { value: "habit", label: "Habit" },
  { value: "other", label: "Other" },
];

export function InterventionForm({ onDone }: { onDone: () => void }) {
  const create = useCreateIntervention();
  const [kind, setKind] = useState<InterventionKind>("period");
  const [category, setCategory] = useState<InterventionCategory>("device");
  const [name, setName] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [endedOn, setEndedOn] = useState("");
  const [detail, setDetail] = useState("");

  const canSubmit = name.trim().length > 0 && startedOn.length === 10;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const body: CreateInterventionBody = {
      kind,
      category,
      name: name.trim(),
      startedOn,
      // An event carries no end date, and an empty field means "ongoing".
      endedOn: kind === "period" && endedOn ? endedOn : null,
      detail: detail.trim() || null,
    };
    create.mutate(body, {
      onSuccess: () => {
        setName("");
        setStartedOn("");
        setEndedOn("");
        setDetail("");
        onDone();
      },
    });
  }

  const field =
    "w-full bg-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface border border-outline-variant/20 focus:border-primary outline-none";
  const label = "block text-[11px] uppercase tracking-wider text-outline mb-1";

  return (
    <form
      onSubmit={submit}
      className="bg-surface-container rounded-xl p-5 space-y-4 border border-outline-variant/10"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="iv-name">
            What changed
          </label>
          <input
            id="iv-name"
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Eight Sleep Pod"
          />
        </div>

        <div>
          <label className={label} htmlFor="iv-category">
            Category
          </label>
          <select
            id="iv-category"
            className={field}
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as InterventionCategory)
            }
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label} htmlFor="iv-kind">
            Shape
          </label>
          <select
            id="iv-kind"
            className={field}
            value={kind}
            onChange={(e) => setKind(e.target.value as InterventionKind)}
          >
            <option value="period">Ongoing or a span</option>
            <option value="event">A one-off moment</option>
          </select>
        </div>

        <div>
          <label className={label} htmlFor="iv-start">
            Started on
          </label>
          <input
            id="iv-start"
            type="date"
            className={field}
            value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)}
          />
        </div>

        {kind === "period" && (
          <div>
            <label className={label} htmlFor="iv-end">
              Ended on <span className="normal-case">(blank = still going)</span>
            </label>
            <input
              id="iv-end"
              type="date"
              className={field}
              value={endedOn}
              onChange={(e) => setEndedOn(e.target.value)}
            />
          </div>
        )}

        <div className={kind === "period" ? "" : "sm:col-span-2"}>
          <label className={label} htmlFor="iv-detail">
            Notes <span className="normal-case">(optional)</span>
          </label>
          <input
            id="iv-detail"
            className={field}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Anything worth remembering later"
          />
        </div>
      </div>

      {create.isError && (
        <p className="text-xs text-error" role="alert">
          {create.error.message}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onDone}
          className="text-xs px-3 py-2 rounded-lg text-on-surface-variant"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit || create.isPending}
          className="text-xs px-4 py-2 rounded-lg bg-primary text-on-primary font-medium disabled:opacity-40"
        >
          {create.isPending ? "Saving…" : "Save change"}
        </button>
      </div>
    </form>
  );
}
