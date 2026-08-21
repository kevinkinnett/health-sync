import { useState } from "react";
import type {
  WorkoutEffectEstimate,
  WorkoutEffectExposure,
  WorkoutEffectsData,
} from "@health-dashboard/shared";
import { Link } from "react-router-dom";
import { EVIDENCE_LABEL } from "./evidence";

const TONE = {
  helped: "border-secondary/30 bg-secondary/10 text-secondary",
  cost: "border-error/30 bg-error/10 text-error",
  unclear: "border-outline-variant/30 bg-surface-container-high text-on-surface-variant",
} as const;

const LABEL = { helped: "Likely benefit", cost: "Recovery cost", unclear: "Still unclear" } as const;

export function WorkoutEffects({ data }: { data: WorkoutEffectsData }) {
  const exposures = [...new Map(
    data.effects.map((effect) => [effect.exposure, effect.exposureLabel]),
  )];
  const [selected, setSelected] = useState<WorkoutEffectExposure>(
    exposures.some(([key]) => key === "all") ? "all" : (exposures[0]?.[0] ?? "all"),
  );
  const visible = data.effects.filter((effect) => effect.exposure === selected);

  return (
    <section className="space-y-4" aria-labelledby="workout-effects-title">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="mb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary" aria-hidden="true">exercise</span>
              <h2 id="workout-effects-title" className="text-lg font-headline font-semibold text-on-surface">
                Is working out helping?
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-on-surface-variant">
              Workout days are compared with unused rest days on the same weekday that had similar
              pre-workout sleep, resting heart rate, HRV, and recent training load.
            </p>
          </div>
          <div className="flex shrink-0 gap-4 text-xs text-on-surface-variant">
            <Stat value={data.sessions} label="sessions" />
            <Stat value={data.workoutDays} label="workout days" />
          </div>
        </div>
        <div className="mt-4 border-t border-primary/15 pt-3">
          <Link
            to="/timeline?category=training"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
          >
            Review training-program changes
            <span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_forward</span>
          </Link>
        </div>
      </div>

      {exposures.length === 0 ? (
        <div className="rounded-xl bg-surface-container p-8 text-center text-sm text-on-surface-variant">
          At least 10 comparable workout and rest days are needed before an effect is shown.
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Workout type">
            {exposures.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected === key}
                onClick={() => setSelected(key)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                  selected === key
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {visible.map((effect) => <EffectCard key={effect.outcome} effect={effect} />)}
          </div>
        </>
      )}

      <details className="rounded-xl bg-surface-container-low px-5 py-4 text-xs text-on-surface-variant">
        <summary className="cursor-pointer font-bold text-on-surface">How to interpret this evidence</summary>
        <div className="mt-3 space-y-2 leading-relaxed">
          <p>
            These are adjusted associations, one level stronger than a raw correlation but not a randomized
            causal result. A range crossing zero is labelled unclear even when its average leans beneficial.
          </p>
          <p>{data.caveats.join(" ")}</p>
        </div>
      </details>
    </section>
  );
}

function EffectCard({ effect }: { effect: WorkoutEffectEstimate }) {
  const delta = `${effect.adjustedDifference > 0 ? "+" : ""}${effect.adjustedDifference.toFixed(1)} ${effect.unit}`;
  const range = `${signed(effect.confidenceInterval.low)} to ${signed(effect.confidenceInterval.high)} ${effect.unit}`;
  return (
    <article className="rounded-xl bg-surface-container p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-outline">{effect.exposureLabel}</p>
          <h3 className="mt-1 text-sm font-headline font-semibold text-on-surface">{effect.outcomeLabel}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${TONE[effect.conclusion]}`}>
          {LABEL[effect.conclusion]}
        </span>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <span className={`text-3xl font-headline font-bold tabular-nums ${
          effect.conclusion === "helped" ? "text-secondary" : effect.conclusion === "cost" ? "text-error" : "text-on-surface"
        }`}>
          {delta}
        </span>
        <span className="pb-1 text-xs text-outline">vs matched rest</span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">{effect.interpretation}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-outline-variant/15 pt-4 text-xs">
        <Metric label="Workout average" value={`${effect.workoutMean.toFixed(1)} ${effect.unit}`} />
        <Metric label="Matched rest average" value={`${effect.matchedRestMean.toFixed(1)} ${effect.unit}`} />
        <Metric label="95% plausible range" value={range} />
        <Metric label="Evidence grade" value={EVIDENCE_LABEL[effect.evidence]} />
        <Metric label="Estimate confidence" value={`${effect.confidence} · n=${effect.workoutDays}`} />
      </dl>
    </article>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-right">
      <div className="text-xl font-headline font-bold tabular-nums text-on-surface">{value}</div>
      <div>{label}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-outline">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-on-surface">{value}</dd>
    </div>
  );
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}
