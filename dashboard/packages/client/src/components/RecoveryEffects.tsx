import { useState } from "react";
import type {
  RecoveryEffectOutcome,
  RecoveryEffectCoverage,
  RecoveryEffectEstimate,
  RecoveryEffectsData,
} from "@health-dashboard/shared";
import { RecoveryEventStudy } from "./RecoveryEventStudy";

const TONE = {
  helped: "border-secondary/30 bg-secondary/10 text-secondary",
  cost: "border-error/30 bg-error/10 text-error",
  unclear: "border-outline-variant/30 bg-surface-container-high text-on-surface-variant",
} as const;

const LABEL = { helped: "Likely benefit", cost: "Possible cost", unclear: "Still unclear" } as const;

export function RecoveryEffects({ data }: { data: RecoveryEffectsData }) {
  const [selectedId, setSelectedId] = useState<number | null>(data.coverage[0]?.activityId ?? null);
  const [outcome, setOutcome] = useState<RecoveryEffectOutcome>("sleep_duration");
  const selected = data.coverage.find((item) => item.activityId === selectedId) ?? data.coverage[0];
  const visible = selected == null
    ? []
    : data.effects.filter((effect) => effect.activityId === selected.activityId);

  return (
    <section id="recovery-effects" className="space-y-4 scroll-mt-24" aria-labelledby="recovery-effects-title">
      <div className="rounded-xl border border-tertiary/25 bg-tertiary/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-1 flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary" aria-hidden="true">spa</span>
              <h2 id="recovery-effects-title" className="text-lg font-headline font-semibold text-on-surface">
                Do recovery sessions seem to help?
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-on-surface-variant">
              Each session is linked to the first main sleep that begins after it ends, within 24 hours.
              That night is compared with an unused night on the same weekday with similar prior sleep,
              resting heart rate, HRV, recent training load, and calendar timing.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-2 text-xs text-on-surface-variant sm:grid-cols-3">
            <Stat value={data.coverage.reduce((sum, item) => sum + item.sessions, 0)} label="sessions" />
            <Stat value={data.coverage.reduce((sum, item) => sum + item.alignedSessions, 0)} label="linked to sleep" />
            <Stat value={data.matching.minimumMatchedPairs} label="pairs needed" />
          </div>
        </div>
      </div>

      {data.coverage.length === 0 ? (
        <div className="rounded-xl bg-surface-container p-8 text-center text-sm text-on-surface-variant">
          Log a Hot blanket or Massage session to begin collecting personal evidence.
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Recovery activity">
            {data.coverage.map((item) => (
              <button
                key={item.activityId}
                type="button"
                role="tab"
                aria-selected={selected?.activityId === item.activityId}
                onClick={() => setSelectedId(item.activityId)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                  selected?.activityId === item.activityId
                    ? "bg-tertiary text-on-tertiary"
                    : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {item.activityName}
              </button>
            ))}
          </div>

          {selected && <CoverageCard coverage={selected} />}

          {selected && <RecoveryEventStudy activityId={selected.activityId} outcome={outcome} onOutcomeChange={setOutcome} />}

          {visible.length === 0 ? (
            <div className="rounded-xl bg-surface-container p-6 text-sm text-on-surface-variant">
              <p className="font-semibold text-on-surface">Still collecting comparable nights</p>
              <p className="mt-1">
                {selected?.matchedPairs ?? 0} of {selected?.requiredPairs ?? data.matching.minimumMatchedPairs} matched pairs are available.
                Effects stay hidden until the evidence floor is met for an individual outcome.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visible.map((effect) => <EffectCard key={effect.outcome} effect={effect} />)}
            </div>
          )}
        </>
      )}

      <details className="rounded-xl bg-surface-container-low px-5 py-4 text-xs text-on-surface-variant">
        <summary className="cursor-pointer font-bold text-on-surface">How to interpret this evidence</summary>
        <div className="mt-3 space-y-2 leading-relaxed">
          <p>
            These are adjusted personal associations, not proof of causation. A plausible range that crosses
            zero is labelled unclear even when the average leans in one direction.
          </p>
          <p>{data.caveats.join(" ")}</p>
        </div>
      </details>
    </section>
  );
}

function CoverageCard({ coverage }: { coverage: RecoveryEffectCoverage }) {
  const progress = Math.min(100, Math.round(coverage.matchedPairs / coverage.requiredPairs * 100));
  return (
    <article className="rounded-xl bg-surface-container-low p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-bold text-on-surface">{coverage.activityName} evidence coverage</span>
        <span className="tabular-nums text-on-surface-variant">
          {coverage.matchedPairs}/{coverage.requiredPairs} matched pairs
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-container-highest" aria-label={`${progress}% of evidence floor`}>
        <div className="h-full rounded-full bg-tertiary" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-xs text-on-surface-variant">
        {coverage.alignedSessions} of {coverage.sessions} sessions linked to a main sleep.
        {coverage.combinedExposures > 0 && ` ${coverage.combinedExposures} combined-exposure nights are shown in coverage but excluded from single-activity estimates.`}
      </p>
    </article>
  );
}

function EffectCard({ effect }: { effect: RecoveryEffectEstimate }) {
  const delta = `${signed(effect.adjustedDifference)} ${effect.unit}`;
  const range = `${signed(effect.confidenceInterval.low)} to ${signed(effect.confidenceInterval.high)} ${effect.unit}`;
  return (
    <article className="rounded-xl bg-surface-container p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-outline">{effect.activityName}</p>
          <h3 className="mt-1 text-sm font-headline font-semibold text-on-surface">{effect.outcomeLabel}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${TONE[effect.conclusion]}`}>
          {LABEL[effect.conclusion]}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <span className={`text-3xl font-headline font-bold tabular-nums ${
          effect.conclusion === "helped" ? "text-secondary" : effect.conclusion === "cost" ? "text-error" : "text-on-surface"
        }`}>{delta}</span>
        <span className="pb-1 text-xs text-outline">vs matched nights</span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">{effect.interpretation}</p>
      <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 border-t border-outline-variant/15 pt-4 text-xs sm:grid-cols-2">
        <Metric label="After-session average" value={`${effect.exposedMean.toFixed(1)} ${effect.unit}`} />
        <Metric label="Matched-night average" value={`${effect.controlMean.toFixed(1)} ${effect.unit}`} />
        <Metric label="95% plausible range" value={range} />
        <Metric label="Evidence" value="Adjusted association" />
        <Metric label="Estimate confidence" value={`${effect.confidence} · n=${effect.exposedPeriods}`} />
      </dl>
    </article>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div className="text-right"><div className="text-xl font-headline font-bold tabular-nums text-on-surface">{value}</div><div>{label}</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-outline">{label}</dt><dd className="mt-0.5 font-medium tabular-nums text-on-surface">{value}</dd></div>;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}
