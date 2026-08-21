import { useMemo, useState } from "react";
import type {
  RecoveryEffectOutcome,
  RecoveryDurationResponse,
  RecoveryEventStudyData,
  RecoveryEventStudyTrajectory,
  RecoveryTimingResponse,
} from "@health-dashboard/shared";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRecoveryEventStudy } from "../api/queries";

const RECOVERY_OUTCOME_OPTIONS: Array<{ value: RecoveryEffectOutcome; label: string }> = [
  { value: "sleep_duration", label: "Sleep duration" },
  { value: "sleep_efficiency", label: "Sleep efficiency" },
  { value: "resting_heart_rate", label: "Resting HR" },
  { value: "hrv", label: "HRV" },
  { value: "restlessness", label: "Restlessness" },
  { value: "readiness", label: "Readiness" },
];

const STATE_COPY: Record<Exclude<RecoveryEventStudyData["evidenceState"], "collecting">, { title: string; body: string }> = {
  individual: { title: "Individual observation", body: "This shows what happened around one or two sessions. It is context, not evidence of a repeatable effect." },
  provisional: { title: "Provisional repeated pattern", body: "At least three eligible sessions can now be summarized, but effect conclusions remain hidden until ten matched pairs exist." },
  matched: { title: "Matched estimate available", body: "The ten-pair evidence floor is met. Review the adjusted estimate beside this descriptive timeline." },
  moderate: { title: "Moderate matched evidence", body: "At least twenty matched pairs support the adjusted estimate beside this timeline." },
  high: { title: "High matched evidence", body: "At least forty matched pairs support the adjusted estimate beside this timeline." },
};

export function RecoveryEventStudy({
  activityId,
  outcome,
  onOutcomeChange,
}: {
  activityId: number;
  outcome: RecoveryEffectOutcome;
  onOutcomeChange: (outcome: RecoveryEffectOutcome) => void;
}) {
  const query = useRecoveryEventStudy(activityId, outcome);
  return (
    <section className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-4 sm:p-5" aria-labelledby="event-study-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 id="event-study-title" className="font-headline text-base font-semibold text-on-surface">What happened around each session?</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-on-surface-variant">
            Wake-date outcomes from seven days before through seven days after. Offset 0 is the first main sleep after the session.
          </p>
        </div>
        <label className="min-w-48 text-xs font-bold text-on-surface-variant">
          Outcome
          <select
            aria-label="Recovery outcome"
            value={outcome}
            onChange={(event) => onOutcomeChange(event.target.value as RecoveryEffectOutcome)}
            className="mt-1 w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm font-medium text-on-surface"
          >
            {RECOVERY_OUTCOME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {query.isLoading && <p className="mt-5 text-sm text-on-surface-variant">Building the event timeline…</p>}
      {query.isError && <p role="alert" className="mt-5 text-sm text-error">Could not load this event timeline: {query.error.message}</p>}
      {query.data && <EventStudyContent data={query.data} />}
    </section>
  );
}

function EventStudyContent({ data }: { data: RecoveryEventStudyData }) {
  const [anchorDate, setAnchorDate] = useState(data.trajectories[0]?.anchorDate ?? "");
  const [exposureOffset, setExposureOffset] = useState(0);
  const [exposureMetric, setExposureMetric] = useState<"duration" | "timing">("duration");
  const selected = data.trajectories.find((trajectory) => trajectory.anchorDate === anchorDate) ?? data.trajectories[0];
  const copy = evidenceCopy(data);
  const chartData = useMemo(() => data.offsets.map((offsetDays) => {
    const selectedPoint = selected?.points.find((point) => point.offsetDays === offsetDays);
    const expectedLow = selectedPoint?.expectedRange?.low ?? null;
    const expectedHigh = selectedPoint?.expectedRange?.high ?? null;
    const row: Record<string, number | string | null> = {
      offsetDays,
      expectedLow,
      expectedSpan: expectedLow != null && expectedHigh != null ? expectedHigh - expectedLow : null,
    };
    data.trajectories.forEach((trajectory, index) => {
      row[`event${index}`] = trajectory.points.find((point) => point.offsetDays === offsetDays)?.actual ?? null;
    });
    return row;
  }), [data.offsets, data.trajectories, selected]);

  return <div className="mt-5 space-y-5">
    <div className="rounded-lg border border-tertiary/20 bg-tertiary/5 p-4" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-on-surface">{copy.title}</p>
        <p className="text-xs tabular-nums text-on-surface-variant">
          {data.eligibleEvents} eligible event{data.eligibleEvents === 1 ? "" : "s"} · {data.matchedPairs}/{data.requiredMatchedPairs} matched pairs
        </p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{copy.body}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-outline">
        Analysis through {data.window.end ? formatDate(data.window.end) : "the latest completed sleep"}. A current wake date appears here only after its completed main sleep links to a session.
      </p>
    </div>

    {data.trajectories.length === 0 ? (
      <p className="rounded-lg bg-surface-container p-5 text-sm text-on-surface-variant">
        {data.pendingSessions > 0
          ? "The timeline will appear after the next completed main sleep can be linked."
          : data.totalSessions > 0
            ? "No logged session could be linked to a completed main sleep within 24 hours."
            : "Log a session to begin this timeline."}
      </p>
    ) : (
      <>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-on-surface-variant">
            Lines are individual sessions. The shaded band is the selected session's observed comparison range.
          </p>
          <label className="text-xs font-bold text-on-surface-variant">
            Inspect session
            <select
              aria-label="Event session"
              value={selected?.anchorDate}
              onChange={(event) => setAnchorDate(event.target.value)}
              className="ml-2 rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2 py-1.5 text-on-surface"
            >
              {data.trajectories.map((trajectory) => (
                <option key={trajectory.anchorDate} value={trajectory.anchorDate}>
                  {formatDate(trajectory.anchorDate)} · {trajectory.totalDurationMinutes} min{trajectory.combinedExposure ? " (combined)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="h-72 min-w-0" role="img" aria-label={`${data.outcomeLabel} around ${data.activityName} sessions in ${data.unit}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
              <XAxis dataKey="offsetDays" tick={{ fontSize: 11 }} label={{ value: "Days from first sleep", position: "insideBottom", offset: -3, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={48} unit={` ${data.unit}`} />
              <Tooltip formatter={(value) => value == null ? "Unavailable" : `${Number(value).toFixed(1)} ${data.unit}`} labelFormatter={(value) => `Day ${Number(value) > 0 ? "+" : ""}${value}`} />
              <ReferenceLine x={0} stroke="var(--color-tertiary)" strokeDasharray="4 4" />
              <Area dataKey="expectedLow" stackId="expected" stroke="none" fill="transparent" isAnimationActive={false} />
              <Area dataKey="expectedSpan" stackId="expected" stroke="none" fill="var(--color-tertiary)" fillOpacity={0.12} isAnimationActive={false} />
              {data.trajectories.map((trajectory, index) => (
                <Line
                  key={trajectory.anchorDate}
                  dataKey={`event${index}`}
                  name={formatDate(trajectory.anchorDate)}
                  stroke={trajectory.anchorDate === selected?.anchorDate ? "var(--color-primary)" : "var(--color-outline)"}
                  strokeOpacity={trajectory.anchorDate === selected?.anchorDate ? 1 : 0.25}
                  strokeWidth={trajectory.anchorDate === selected?.anchorDate ? 2.5 : 1}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {data.aggregate.length > 0 && <AggregateSummary data={data} />}
        <ExposureResponsePanel
          data={data}
          offsetDays={exposureOffset}
          metric={exposureMetric}
          onOffsetChange={setExposureOffset}
          onMetricChange={setExposureMetric}
        />
        {selected && <EventTable trajectory={selected} data={data} />}
      </>
    )}

    <details className="text-xs text-on-surface-variant">
      <summary className="cursor-pointer font-bold text-on-surface">Limits of this timeline</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">{data.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
    </details>
  </div>;
}

function evidenceCopy(data: RecoveryEventStudyData): { title: string; body: string } {
  if (data.evidenceState !== "collecting") return STATE_COPY[data.evidenceState];
  if (data.pendingSessions > 0) {
    return {
      title: "Waiting for a completed main sleep",
      body: `${data.pendingSessions} recent ${data.activityName} session${data.pendingSessions === 1 ? " is" : "s are"} waiting for the next completed main sleep. It will link automatically when an eligible sleep arrives.`,
    };
  }
  if (data.totalSessions > 0) {
    return {
      title: "No aligned sleep found",
      body: "The logged session could not be linked to a completed main sleep that began within 24 hours after it ended.",
    };
  }
  return {
    title: "Waiting for the first session",
    body: "Log a session to begin this timeline. Its first eligible main sleep will link automatically.",
  };
}

function ExposureResponsePanel({
  data,
  offsetDays,
  metric,
  onOffsetChange,
  onMetricChange,
}: {
  data: RecoveryEventStudyData;
  offsetDays: number;
  metric: "duration" | "timing";
  onOffsetChange: (offset: number) => void;
  onMetricChange: (metric: "duration" | "timing") => void;
}) {
  const isDuration = metric === "duration";
  const responses = isDuration ? (data.durationResponses ?? []) : (data.timingResponses ?? []);
  const response = responses.find((candidate) => candidate.offsetDays === offsetDays) ?? responses[0];
  const points = data.trajectories.flatMap((trajectory) => {
    const point = trajectory.points.find((candidate) => candidate.offsetDays === offsetDays);
    return point?.delta == null ? [] : [{
      anchorDate: trajectory.anchorDate,
      durationMinutes: trajectory.totalDurationMinutes,
      sessionToSleepMinutes: trajectory.sessionToSleepMinutes,
      durationGroup: trajectory.durationGroup,
      delta: point.delta,
      contaminated: !trajectory.eligible || point.excludedFromAggregate,
    }];
  });
  const available = points.filter((point) => !point.contaminated);
  const contaminated = points.filter((point) => point.contaminated);
  const predictorKey = isDuration ? "durationMinutes" : "sessionToSleepMinutes";
  const predictorName = isDuration ? "Duration" : "Time before sleep";

  return <section className="rounded-lg border border-outline-variant/15 bg-surface-container p-4" aria-labelledby="exposure-response-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h4 id="exposure-response-title" className="text-sm font-bold text-on-surface">
          Does {isDuration ? "session duration" : "time before sleep"} track with the outcome?
        </h4>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-on-surface-variant">
          Each point compares one event with its expected {data.outcomeLabel.toLowerCase()}. Duration and time before sleep are analyzed separately.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="text-xs font-bold text-on-surface-variant">
          Exposure factor
          <select
            aria-label="Exposure factor"
            value={metric}
            onChange={(event) => onMetricChange(event.target.value as "duration" | "timing")}
            className="ml-2 rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2 py-1.5 text-on-surface"
          >
            <option value="duration">Session duration</option>
            <option value="timing">Time before sleep</option>
          </select>
        </label>
        <label className="text-xs font-bold text-on-surface-variant">
          Outcome day
          <select
            aria-label="Exposure response offset"
            value={offsetDays}
            onChange={(event) => onOffsetChange(Number(event.target.value))}
            className="ml-2 rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2 py-1.5 text-on-surface"
          >
            {Array.from({ length: 8 }, (_, offset) => <option key={offset} value={offset}>Day {offset === 0 ? "0, first sleep" : `+${offset}`}</option>)}
          </select>
        </label>
      </div>
    </div>

    <ExposureState response={response} metric={metric} unit={data.unit} />

    {points.length === 0 ? (
      <p className="mt-4 rounded-lg bg-surface-container-low p-4 text-xs text-on-surface-variant">
        No recent event has both an actual value and an expected comparison at this offset.
      </p>
    ) : <>
      <div className="mt-4 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant" aria-label={isDuration ? "Duration display groups" : "Timing point status"}>
        {isDuration ? <>
          <ExposureLegend color="var(--color-primary)" label="Short, up to 30 min" />
          <ExposureLegend color="var(--color-tertiary)" label="Medium, 31 to 44 min" />
          <ExposureLegend color="var(--color-secondary)" label="Long, 45+ min" />
        </> : <ExposureLegend color="var(--color-primary)" label="Eligible session" />}
        {contaminated.length > 0 && <ExposureLegend color="var(--color-outline)" label="Contaminated, excluded" />}
      </div>
      <div className="mt-2 h-64 min-w-0" role="img" aria-label={`${data.outcomeLabel} difference by ${data.activityName} ${isDuration ? "duration" : "time before sleep"} on day ${offsetDays}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, bottom: 18, left: 0 }}>
            <CartesianGrid stroke="var(--color-outline-variant)" strokeOpacity={0.15} />
            <XAxis type="number" dataKey={predictorKey} name={predictorName} unit=" min" tick={{ fontSize: 11 }} label={{ value: isDuration ? "Total logged minutes" : "Minutes from session end to sleep", position: "insideBottom", offset: -10, fontSize: 11 }} />
            <YAxis type="number" dataKey="delta" name="Difference" unit={` ${data.unit}`} tick={{ fontSize: 11 }} width={52} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value, name) => name === predictorName ? `${value} min` : `${Number(value).toFixed(1)} ${data.unit}`} />
            <ReferenceLine y={0} stroke="var(--color-outline)" strokeDasharray="4 4" />
            <Scatter name="Eligible sessions" data={available} isAnimationActive={false}>
              {available.map((point) => <Cell key={point.anchorDate} fill={isDuration ? durationColor(point.durationGroup) : "var(--color-primary)"} />)}
            </Scatter>
            <Scatter name="Contaminated sessions" data={contaminated} fill="var(--color-outline)" opacity={0.45} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <ExposureTable points={points} unit={data.unit} offsetDays={offsetDays} />
    </>}
    <p className="mt-3 text-[11px] leading-relaxed text-outline">
      {isDuration
        ? "Duration can track available time, stress, bedtime, or why a longer session was possible."
        : "Time before sleep can track bedtime, routine, stress, or why the session happened earlier or later."} This is an association, not evidence that changing {isDuration ? "session length" : "the gap before sleep"} caused the outcome. Duration and timing may correlate; neither estimate controls for the other.
    </p>
  </section>;
}

function ExposureState({
  response,
  metric,
  unit,
}: {
  response: RecoveryDurationResponse | RecoveryTimingResponse | undefined;
  metric: "duration" | "timing";
  unit: string;
}) {
  if (!response || response.state === "insufficient_events") {
    return <p className="mt-4 rounded-lg bg-surface-container-low p-3 text-xs text-on-surface-variant">
      {response?.eligibleEvents ?? 0} of 10 comparable, uncontaminated events are available at this offset. Individual points are shown without a {metric === "duration" ? "duration" : "timing"} trend.
    </p>;
  }
  if (response.state === "insufficient_variation") {
    const variation = metric === "duration"
      ? { values: (response as RecoveryDurationResponse).distinctDurations, range: (response as RecoveryDurationResponse).durationRangeMinutes, minimum: 20 }
      : { values: (response as RecoveryTimingResponse).distinctTimings, range: (response as RecoveryTimingResponse).timingRangeMinutes, minimum: 60 };
    return <p className="mt-4 rounded-lg bg-surface-container-low p-3 text-xs text-on-surface-variant">
      There are {response.eligibleEvents} events, but {metric === "duration" ? "duration" : "time before sleep"} varies across only {variation.values} values and {variation.range} minutes. A trend needs three values spanning at least {variation.minimum} minutes.
    </p>;
  }
  const slope = metric === "duration"
    ? (response as RecoveryDurationResponse).slopePer10Minutes
    : (response as RecoveryTimingResponse).slopePer60Minutes;
  return <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg border border-tertiary/20 bg-tertiary/5 p-3 text-xs sm:grid-cols-3">
    <ExposureMetric label={`Robust change per ${metric === "duration" ? "10 min" : "60 min earlier"}`} value={`${signedDecimal(slope)} ${unit}`} />
    <ExposureMetric label="Bootstrap interval" value={`${signedDecimal(response.slopeConfidenceInterval?.low)} to ${signedDecimal(response.slopeConfidenceInterval?.high)} ${unit}`} />
    <ExposureMetric label="Rank association" value={`${response.rankCorrelation?.toFixed(2)} · n=${response.eligibleEvents}`} />
  </div>;
}

function ExposureTable({
  points,
  unit,
  offsetDays,
}: {
  points: Array<{ anchorDate: string; durationMinutes: number; sessionToSleepMinutes: number; durationGroup: string; delta: number; contaminated: boolean }>;
  unit: string;
  offsetDays: number;
}) {
  return <div className="mt-3 overflow-x-auto">
    <table className="w-full min-w-[620px] text-left text-xs">
      <caption className="mb-2 text-left font-bold text-on-surface">Exposure observations for day {offsetDays === 0 ? "0" : `+${offsetDays}`}</caption>
      <thead className="border-b border-outline-variant/20 text-outline"><tr>
        <th className="px-2 py-2">Session sleep</th><th className="px-2 py-2">Duration</th><th className="px-2 py-2">Display group</th>
        <th className="px-2 py-2">Session end to sleep</th><th className="px-2 py-2">Difference</th><th className="px-2 py-2">Status</th>
      </tr></thead>
      <tbody>{points.map((point) => <tr key={point.anchorDate} className="border-b border-outline-variant/10">
        <td className="px-2 py-2 text-on-surface">{formatDate(point.anchorDate)}</td>
        <td className="px-2 py-2 tabular-nums text-on-surface">{point.durationMinutes} min</td>
        <td className="px-2 py-2 capitalize text-on-surface">{point.durationGroup}</td>
        <td className="px-2 py-2 tabular-nums text-on-surface">{point.sessionToSleepMinutes} min</td>
        <td className="px-2 py-2 tabular-nums text-on-surface">{signedDecimal(point.delta)} {unit}</td>
        <td className="px-2 py-2 text-on-surface-variant">{point.contaminated ? "Excluded, another recovery exposure" : "Included"}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function ExposureLegend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>;
}

function ExposureMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-outline">{label}</p><p className="mt-0.5 font-bold tabular-nums text-on-surface">{value}</p></div>;
}

function durationColor(group: string): string {
  if (group === "short") return "var(--color-primary)";
  if (group === "medium") return "var(--color-tertiary)";
  return "var(--color-secondary)";
}

function AggregateSummary({ data }: { data: RecoveryEventStudyData }) {
  return <div className="rounded-lg bg-surface-container p-4">
    <p className="text-xs font-bold text-on-surface">Provisional median difference from expected</p>
    <p className="mt-1 text-xs text-on-surface-variant">Only offsets with at least three uncontaminated event comparisons are included.</p>
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {data.aggregate.map((point) => <div key={point.offsetDays} className="min-w-24 rounded-lg bg-surface-container-lowest px-3 py-2 text-center">
        <p className="text-[10px] font-bold uppercase tracking-wide text-outline">Day {signed(point.offsetDays)}</p>
        <p className="mt-1 text-sm font-bold tabular-nums text-on-surface">{signed(point.medianDelta)} {data.unit}</p>
        <p className="text-[10px] text-outline">n={point.sampleCount}</p>
      </div>)}
    </div>
  </div>;
}

function EventTable({ trajectory, data }: { trajectory: RecoveryEventStudyTrajectory; data: RecoveryEventStudyData }) {
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[680px] text-left text-xs">
      <caption className="mb-2 text-left font-bold text-on-surface">
        Session ending before sleep on {formatDate(trajectory.anchorDate)}. {trajectory.totalDurationMinutes} total minutes, sleep began {trajectory.sessionToSleepMinutes} minutes after the latest session ended
        {trajectory.combinedExposure ? ". Combined exposure; excluded from the provisional summary." : ""}
      </caption>
      <thead className="border-b border-outline-variant/20 text-outline"><tr>
        <th className="px-2 py-2">Wake date</th><th className="px-2 py-2">Offset</th><th className="px-2 py-2">Actual</th>
        <th className="px-2 py-2">Expected median</th><th className="px-2 py-2">Observed range</th><th className="px-2 py-2">Controls</th><th className="px-2 py-2">Context</th>
      </tr></thead>
      <tbody>{trajectory.points.map((point) => <tr key={point.offsetDays} className="border-b border-outline-variant/10">
        <td className="px-2 py-2 tabular-nums text-on-surface">{formatDate(point.date)}</td>
        <td className="px-2 py-2 tabular-nums text-on-surface">{signed(point.offsetDays)}</td>
        <td className="px-2 py-2 tabular-nums text-on-surface">{formatValue(point.actual, data.unit)}</td>
        <td className="px-2 py-2 tabular-nums text-on-surface">{formatValue(point.expectedCenter, data.unit)}</td>
        <td className="px-2 py-2 tabular-nums text-on-surface">{point.expectedRange ? `${point.expectedRange.low.toFixed(1)} to ${point.expectedRange.high.toFixed(1)} ${data.unit}` : "Unavailable"}</td>
        <td className="px-2 py-2 tabular-nums text-on-surface">{point.controlCount}</td>
        <td className="px-2 py-2 text-on-surface-variant">{point.recoveryExposures.length > 0 ? `${point.recoveryExposures.join(", ")}${point.excludedFromAggregate ? "; excluded from summary" : ""}` : point.actual == null ? "Missing measurement" : "No recorded recovery exposure"}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function formatValue(value: number | null, unit: string): string {
  return value == null ? "Unavailable" : `${value.toFixed(1)} ${unit}`;
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

function signedDecimal(value: number | null | undefined): string {
  if (value == null) return "Unavailable";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}
