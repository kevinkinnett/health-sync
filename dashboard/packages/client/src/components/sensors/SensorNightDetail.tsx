import { Link } from "react-router-dom";
import type {
  SensorAgreementData,
  SensorAgreementNight,
  SensorAgreementSeries,
  SensorSleepSessionContext,
} from "@health-dashboard/shared";
import { useSensorNightContext } from "../../api/queries";
import { addDays, formatDateInTz } from "../../lib/userTz";
import { SidePanelDialog } from "../ui/SidePanelDialog";
import type { ChartAnnotation } from "../charts/annotations";

interface SensorNightDetailProps {
  date: string | null;
  data: SensorAgreementData;
  annotations: ChartAnnotation[];
  onClose: () => void;
}

export function SensorNightDetail(props: SensorNightDetailProps) {
  if (!props.date) return null;
  return <SensorNightDetailOpen {...props} date={props.date} />;
}

function SensorNightDetailOpen({
  date,
  data,
  annotations,
  onClose,
}: Omit<SensorNightDetailProps, "date"> & { date: string }) {
  const context = useSensorNightContext(date);
  const night = data.nights.find((item) => item.date === date);
  const selectedMetrics = data.series.flatMap((series) => {
    const point = series.points.find((item) => item.date === date);
    return point ? [{ series, point }] : [];
  });
  const changes = annotations.filter((item) => item.date === date);
  const previousDate = addDays(date, -1);

  return (
    <SidePanelDialog
      title={`Wake date ${formatCalendarDate(date)}`}
      subtitle="Fitbit device via Google Health and Eight Sleep, aligned to the same Eastern wake date"
      metadata={`${data.timezone} · raw session times also shown in UTC`}
      closeLabel="Close night detail"
      onClose={onClose}
    >
      <div className="space-y-5 p-5">
        <section aria-labelledby="night-comparison-heading">
          <SectionHeading id="night-comparison-heading" icon="compare_arrows">Metric comparison</SectionHeading>
          <div className="mt-3 space-y-2">
            {selectedMetrics.map(({ series, point }) => (
              <MetricRow key={series.metric} series={series} point={point} />
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-outline">
            Trend alignment compares each source with its own selected-window baseline. It does not decide which sensor is correct.
          </p>
        </section>

        {night && (
          <>
            <section aria-labelledby="night-sessions-heading">
              <SectionHeading id="night-sessions-heading" icon="bedtime">Session evidence</SectionHeading>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <SessionCard title="Fitbit device" subtitle="via Google Health" context={night.fitbit} timezone={data.timezone} />
                <SessionCard title="Eight Sleep" subtitle="mattress sensor" context={night.eightSleep} timezone={data.timezone} />
              </div>
            </section>

            <section aria-labelledby="night-explanation-heading" className="rounded-xl border border-outline-variant/15 bg-surface-container p-4">
              <SectionHeading id="night-explanation-heading" icon="troubleshoot">What could explain the gap?</SectionHeading>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-on-surface-variant">
                {explanationsFor(night).map((explanation) => (
                  <li key={explanation} className="flex gap-2">
                    <span className="material-symbols-outlined mt-0.5 text-sm text-primary" aria-hidden="true">arrow_right</span>
                    <span>{explanation}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-outline">These are data-quality checks, not a diagnosis or a claim that either device is more accurate.</p>
            </section>
          </>
        )}

        <section aria-labelledby="night-context-heading">
          <SectionHeading id="night-context-heading" icon="event_note">Nearby context</SectionHeading>
          <p className="mt-1 text-xs text-on-surface-variant">Events on {previousDate} and the {date} wake date can help explain a real physiological change, but not a sensor-specific measurement gap.</p>
          {context.isLoading ? (
            <p role="status" className="mt-3 text-xs text-outline">Loading activity and intake context…</p>
          ) : context.error ? (
            <p className="mt-3 text-xs text-error">Nearby context could not be loaded. The sensor evidence above is still complete.</p>
          ) : context.data ? (
            <NearbyContext data={context.data} date={date} timezone={data.timezone} changes={changes.map((item) => item.label)} />
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <ContextLink to="/timeline" icon="timeline">Review changes</ContextLink>
            <ContextLink to="/supplements" icon="nutrition">Supplement log</ContextLink>
            <ContextLink to="/medications" icon="medication">Medication log</ContextLink>
          </div>
        </section>
      </div>
    </SidePanelDialog>
  );
}

function MetricRow({
  series,
  point,
}: {
  series: SensorAgreementSeries;
  point: SensorAgreementSeries["points"][number];
}) {
  const tone = point.trendAlignment === "aligned"
    ? "bg-secondary/10 text-secondary"
    : point.trendAlignment === "divergent"
      ? "bg-error/10 text-error"
      : "bg-tertiary/10 text-tertiary";
  return (
    <div className="rounded-lg bg-surface-container p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-on-surface">{series.label}</p>
          <p className="mt-0.5 text-[11px] tabular-nums text-on-surface-variant">
            Fitbit {formatMetric(point.fitbit, series.unit)} · Eight {formatMetric(point.eightSleep, series.unit)}
            {point.difference != null ? ` · raw gap ${formatMetric(Math.abs(point.difference), series.unit)}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${tone}`}>
          {point.trendAlignment === "unknown" ? "No trend baseline" : `${point.trendAlignment}${point.divergencePattern ? ` · ${point.divergencePattern}` : ""}`}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-outline">
        <span>Trend gap {point.trendGap == null ? "—" : `${point.trendGap.toFixed(2)} z`}</span>
        <span>Trailing agreement {point.rollingCorrelation == null ? "Need 7 joined nights" : `r ${point.rollingCorrelation.toFixed(2)}`}</span>
        <span>Fitbit regime {point.fitbitRegime}</span>
      </div>
    </div>
  );
}

function SessionCard({
  title,
  subtitle,
  context,
  timezone,
}: {
  title: string;
  subtitle: string;
  context: SensorSleepSessionContext;
  timezone: string;
}) {
  const values = [
    ["Main sleep", minutes(context.sleepDurationMin)],
    ["Deep / light / REM", stageSummary(context)],
    ["Time in bed", minutes(context.timeInBedMin)],
    ["Naps", minutes(context.napMin)],
    ["Efficiency", context.efficiency == null ? null : `${context.efficiency.toFixed(0)}%`],
    ["Sleep score", number(context.score)],
    ["Sleep records", number(context.sleepRecords)],
    ["Toss & turns", number(context.tossAndTurnCount)],
    ["Bed / room", temperatureSummary(context)],
  ].filter((entry): entry is [string, string] => entry[1] != null);
  return (
    <article className="rounded-xl bg-surface-container p-4">
      <p className="text-sm font-bold text-on-surface">{title}</p>
      <p className="text-[10px] uppercase tracking-wider text-outline">{subtitle}</p>
      <dl className="mt-3 space-y-2 text-xs">
        <SessionTime label="Start" value={context.sessionStart} timezone={timezone} />
        <SessionTime label="End" value={context.sessionEnd} timezone={timezone} />
        {values.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="text-outline">{label}</dt>
            <dd className="text-right tabular-nums text-on-surface-variant">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 break-all text-[9px] text-outline">{context.regime}</p>
    </article>
  );
}

function SessionTime({ label, value, timezone }: { label: string; value: string | null; timezone: string }) {
  if (!value) return null;
  return (
    <div className="border-b border-outline-variant/10 pb-2">
      <dt className="text-outline">{label}</dt>
      <dd className="mt-0.5 tabular-nums text-on-surface-variant">{formatInstant(value, timezone)}</dd>
    </div>
  );
}

function NearbyContext({
  data,
  date,
  timezone,
  changes,
}: {
  data: NonNullable<ReturnType<typeof useSensorNightContext>["data"]>;
  date: string;
  timezone: string;
  changes: string[];
}) {
  const relevantDates = new Set([addDays(date, -1), date]);
  const activity = data.activity.filter((item) => relevantDates.has(item.date));
  const exercises = data.exerciseLogs.filter((item) => relevantDates.has(item.date));
  const medications = data.medicationIntakes.filter((item) => relevantDates.has(formatDateInTz(item.takenAt, timezone)));
  const supplements = data.supplementIntakes.filter((item) => relevantDates.has(formatDateInTz(item.takenAt, timezone)));
  const empty = activity.length + exercises.length + medications.length + supplements.length + changes.length === 0;
  if (empty) return <p className="mt-3 rounded-lg bg-surface-container p-3 text-xs text-outline">No nearby activity, logged intake, workout, or dated change was found.</p>;
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {activity.map((item) => (
        <ContextItem key={`activity-${item.date}`} icon="footprint" title={`Activity · ${item.date}`}>
          {item.steps?.toLocaleString() ?? "—"} steps · {(item.minutesFairlyActive ?? 0) + (item.minutesVeryActive ?? 0)} active min
        </ContextItem>
      ))}
      {exercises.map((item) => (
        <ContextItem key={`exercise-${item.logId}`} icon="exercise" title={`${item.activityName} · ${item.date}`}>
          {item.durationMs == null ? "Duration unavailable" : `${Math.round(item.durationMs / 60_000)} min`}
          {item.averageHeartRate == null ? "" : ` · avg ${item.averageHeartRate} bpm`}
        </ContextItem>
      ))}
      {medications.map((item) => (
        <ContextItem key={`medication-${item.id}`} icon="medication" title={item.itemName}>
          {item.amount} {item.unit} · {formatLocalTime(item.takenAt, timezone)}
        </ContextItem>
      ))}
      {supplements.map((item) => (
        <ContextItem key={`supplement-${item.id}`} icon="nutrition" title={item.itemName}>
          {item.amount} {item.unit} · {formatLocalTime(item.takenAt, timezone)}
        </ContextItem>
      ))}
      {changes.map((change) => (
        <ContextItem key={`change-${change}`} icon="timeline" title="Dated change">{change}</ContextItem>
      ))}
    </div>
  );
}

function ContextItem({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-container p-3 text-xs">
      <div className="flex items-center gap-1.5 font-bold text-on-surface">
        <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">{icon}</span>{title}
      </div>
      <p className="mt-1 text-on-surface-variant">{children}</p>
    </div>
  );
}

function ContextLink({ to, icon, children }: { to: string; icon: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-surface-container px-3 text-xs font-bold text-primary hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <span className="material-symbols-outlined text-base" aria-hidden="true">{icon}</span>{children}
    </Link>
  );
}

function SectionHeading({ id, icon, children }: { id: string; icon: string; children: React.ReactNode }) {
  return <h2 id={id} className="flex items-center gap-2 font-headline text-sm font-bold text-on-surface"><span className="material-symbols-outlined text-lg text-primary" aria-hidden="true">{icon}</span>{children}</h2>;
}

function explanationsFor(night: SensorAgreementNight): string[] {
  const explanations: string[] = [];
  const startGap = timeGapMinutes(night.fitbit.sessionStart, night.eightSleep.sessionStart);
  const endGap = timeGapMinutes(night.fitbit.sessionEnd, night.eightSleep.sessionEnd);
  if (startGap != null && startGap >= 30) explanations.push(`The detected session starts differ by ${Math.round(startGap)} minutes.`);
  if (endGap != null && endGap >= 30) explanations.push(`The detected session ends differ by ${Math.round(endGap)} minutes.`);
  if ((night.fitbit.napMin ?? 0) > 0) explanations.push(`Google Health recorded ${Math.round(night.fitbit.napMin ?? 0)} nap minutes separately from main sleep.`);
  if ((night.fitbit.sleepRecords ?? 0) > 1) explanations.push(`Google Health contains ${night.fitbit.sleepRecords} sleep records on this wake date; only the main session is compared.`);
  if (!night.fitbit.sessionStart || !night.fitbit.sessionEnd || !night.eightSleep.sessionStart || !night.eightSleep.sessionEnd) explanations.push("At least one source lacks complete session boundaries, which limits timing checks.");
  explanations.push("The wearable and mattress infer sleep from different signals and may classify awake time or stages differently even when their session boundaries match.");
  return explanations;
}

function formatMetric(value: number, unit: string): string {
  return `${value.toFixed(1)} ${unit}`;
}

function formatCalendarDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function formatInstant(value: string, timezone: string): string {
  const date = new Date(value);
  const local = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
  const utc = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  return `${local} · ${utc} UTC`;
}

function formatLocalTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}

function minutes(value: number | null): string | null {
  if (value == null) return null;
  const hours = Math.floor(value / 60);
  const remainder = Math.round(value % 60);
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function number(value: number | null): string | null {
  return value == null ? null : String(value);
}

function stageSummary(context: SensorSleepSessionContext): string | null {
  if (context.deepMin == null && context.lightMin == null && context.remMin == null) return null;
  return `${Math.round(context.deepMin ?? 0)} / ${Math.round(context.lightMin ?? 0)} / ${Math.round(context.remMin ?? 0)} min`;
}

function temperatureSummary(context: SensorSleepSessionContext): string | null {
  if (context.bedTempC == null && context.roomTempC == null) return null;
  const format = (value: number | null) => value == null ? "—" : `${value.toFixed(1)}°C`;
  return `${format(context.bedTempC)} / ${format(context.roomTempC)}`;
}

function timeGapMinutes(left: string | null, right: string | null): number | null {
  if (!left || !right) return null;
  const gap = Math.abs(new Date(left).getTime() - new Date(right).getTime());
  return Number.isFinite(gap) ? gap / 60_000 : null;
}
