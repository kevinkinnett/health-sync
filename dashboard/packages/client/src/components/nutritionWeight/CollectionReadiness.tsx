import type { NutritionWeightReadiness } from "@health-dashboard/shared";

interface Props {
  readiness: NutritionWeightReadiness;
}

export function CollectionReadiness({ readiness }: Props) {
  const ready = readiness.state === "ready";
  const checks = [
    {
      label: "Calendar span",
      current: readiness.observedSpanDays,
      target: readiness.thresholds.observedSpanDays,
      unit: "days",
    },
    {
      label: "Food logs",
      current: readiness.foodLoggedDays,
      target: readiness.thresholds.foodLoggedDays,
      unit: "days",
    },
    {
      label: "Weight check-ins",
      current: readiness.weightObservedDates,
      target: readiness.thresholds.weightObservedDates,
      unit: "dates",
    },
  ];

  return (
    <section
      aria-labelledby="collection-readiness-heading"
      className="bg-surface-container rounded-xl p-5 border border-outline-variant/10"
    >
      <div className="flex items-start gap-3">
        <span
          className="material-symbols-outlined mt-0.5 text-primary"
          aria-hidden="true"
        >
          {ready ? "check_circle" : "hourglass_top"}
        </span>
        <div>
          <h2
            id="collection-readiness-heading"
            className="text-sm font-headline font-semibold text-on-surface"
          >
            {ready ? "Enough history for longer comparisons" : "Building a useful history"}
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            {ready
              ? "The minimum collection thresholds are met. Any relationship still needs careful interpretation."
              : "Keep logging consistently. Longer comparisons stay hidden until the minimum coverage is met."}
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        {checks.map((check) => {
          const complete = check.current >= check.target;
          return (
            <div key={check.label} className="rounded-lg bg-surface-container-high p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-on-surface-variant">{check.label}</span>
                <span className="material-symbols-outlined text-base text-outline" aria-hidden="true">
                  {complete ? "check" : "more_horiz"}
                </span>
              </div>
              <div className="text-base font-bold tabular-nums text-on-surface mt-1">
                {check.current} / {check.target} {check.unit}
              </div>
            </div>
          );
        })}
      </div>
      {!ready && readiness.reasons.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-outline list-disc pl-5">
          {readiness.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
