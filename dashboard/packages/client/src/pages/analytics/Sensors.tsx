import type { SensorAgreementSeries } from "@health-dashboard/shared";
import { useSensorAgreement } from "../../api/queries";
import { QueryBoundary, EmptyState } from "../../components/QueryBoundary";
import { SensorAgreementChart } from "../../components/charts/SensorAgreementChart";
import { useChartAnnotations } from "../../components/charts/annotations";

function fmt(value: number | null, digits = 2): string {
  return value == null ? "—" : value.toFixed(digits);
}

function AgreementCard({
  series,
  annotations,
}: {
  series: SensorAgreementSeries;
  annotations: ReturnType<typeof useChartAnnotations>;
}) {
  const latest = series.points.at(-1);
  return (
    <article className="rounded-xl bg-surface-container p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-headline text-base font-semibold text-on-surface">{series.label}</h2>
          <p className="mt-1 text-xs text-on-surface-variant">
            {series.measurementComparable
              ? `${series.fitbitMeasurement} compared directly with ${series.eightSleepMeasurement}.`
              : `${series.fitbitMeasurement} and ${series.eightSleepMeasurement} are different constructs; the chart compares standardized direction only.`}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${series.measurementComparable ? "bg-secondary/10 text-secondary" : "bg-tertiary/10 text-tertiary"}`}>
          {series.measurementComparable ? "comparable" : "related definitions"}
        </span>
      </div>

      <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Joined nights" value={String(series.joinedDays)} />
        <Metric
          label="Correlation"
          value={series.correlation == null
            ? series.joinedDays < 7 ? "Need 7 nights" : "—"
            : `r ${fmt(series.correlation)}`}
        />
        {series.measurementComparable ? (
          <>
            <Metric label="Avg. absolute gap" value={`${fmt(series.meanAbsoluteDifference, 1)} ${series.unit}`} />
            <Metric label="Eight − Fitbit" value={`${fmt(series.meanDifference, 1)} ${series.unit}`} />
          </>
        ) : latest ? (
          <>
            <Metric label="Latest daily RHR" value={`${latest.fitbit.toFixed(1)} bpm`} />
            <Metric label="Latest sleeping HR" value={`${latest.eightSleep.toFixed(1)} bpm`} />
          </>
        ) : null}
      </div>

      <SensorAgreementChart series={series} annotations={annotations} />

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-outline">
        <span>Fitbit regime: {series.fitbitRegimes.join(", ") || "unknown"}</span>
        <span>Eight Sleep regime: {series.eightSleepRegime}</span>
      </div>

      {series.largestDivergences.length > 0 && (
        <details className="mt-4 rounded-lg bg-surface-container-low px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-on-surface-variant">Largest gaps in this window</summary>
          <ul className="mt-2 space-y-1 text-xs text-on-surface-variant">
            {series.largestDivergences.map((point) => (
              <li key={point.date} className="flex justify-between gap-3 tabular-nums">
                <span>{point.date}</span>
                <span>Fitbit {point.fitbit.toFixed(1)} · Eight {point.eightSleep.toFixed(1)} · gap {point.absoluteDifference.toFixed(1)} {series.unit}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold tabular-nums text-on-surface">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-outline">{label}</div>
    </div>
  );
}

export function AnalyticsSensors() {
  const query = useSensorAgreement();
  const marks = useChartAnnotations(
    (query.data?.series ?? []).flatMap((series) => series.points.map((point) => point.date)),
  );
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-4 text-sm text-on-surface-variant">
        Each point is the same local wake date in America/New_York. Agreement means the sensors move together; it does not require identical raw values. Readiness standardizes each source against its own same-method baseline before fusion.
      </div>
      <QueryBoundary
        query={query}
        empty={<EmptyState icon="sensors" message="No overlapping sensor nights in this window" />}
        isEmpty={(data) => data.series.every((series) => series.joinedDays === 0)}
      >
        {(data) => (
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            {data.series.map((series) => (
              <AgreementCard
                key={series.metric}
                series={series}
                annotations={marks}
              />
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
