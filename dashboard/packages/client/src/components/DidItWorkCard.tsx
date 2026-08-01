import { Link } from "react-router-dom";
import type {
  ExperimentConfidence,
  ExperimentSummary,
  MetricEffect,
} from "@health-dashboard/shared";
import { STATUS, CHART_CHROME } from "./charts/chartPalette";

/**
 * "Did anything you changed work?" — asked on the home screen, unprompted.
 *
 * The engine that answers this shipped weeks ago and went unseen, because
 * the only way in was a sidebar item named after a noun ("Timeline") with
 * the verdict two clicks further down. The analysis was never the missing
 * piece; the question was. This card asks it where the day starts, gives
 * the shortest true answer, and links to the working.
 *
 * Every row carries its confidence. A number without its caveat is worse
 * than no number on a screen people glance at — that is the whole reason
 * the report refuses to print a p-value, and the same discipline applies
 * to a one-line summary of it.
 */

const CONFIDENCE_STYLE: Record<
  ExperimentConfidence,
  { label: string; color: string }
> = {
  strong: { label: "Strong evidence", color: STATUS.good },
  moderate: { label: "Moderate evidence", color: STATUS.good },
  weak: { label: "Weak evidence", color: STATUS.warning },
  insufficient: { label: "Not enough data", color: CHART_CHROME.axis },
};

export function DidItWorkCard({ data }: { data: ExperimentSummary[] }) {
  return (
    <div className="bg-surface-container rounded-xl p-5" data-testid="did-it-work">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-headline font-semibold text-on-surface">
          Did it work?
        </h3>
        <Link
          to="/timeline"
          className="text-xs text-primary hover:underline shrink-0"
        >
          All changes
        </Link>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-on-surface-variant mt-2" data-testid="did-it-work-empty">
          Nothing to compare yet. Log a change on the{" "}
          <Link to="/timeline" className="text-primary hover:underline">
            timeline
          </Link>{" "}
          — a device, a dose, a new routine — and this will report what moved
          after it.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.map((s) => (
            <VerdictRow key={s.interventionId} summary={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function VerdictRow({ summary }: { summary: ExperimentSummary }) {
  const conf = CONFIDENCE_STYLE[summary.confidence] ?? CONFIDENCE_STYLE.weak;
  return (
    <li>
      <Link
        to={`/timeline?intervention=${summary.interventionId}`}
        className="block rounded-lg bg-surface-container-high p-3 hover:bg-surface-container-highest transition-colors"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-on-surface truncate">
            {summary.interventionName}
          </span>
          <span className="text-[10px] text-outline tabular-nums shrink-0">
            {summary.changepoint}
          </span>
        </div>

        {summary.headline ? (
          <Headline effect={summary.headline} />
        ) : (
          <p className="text-xs text-on-surface-variant mt-1">
            Nothing moved meaningfully.
          </p>
        )}

        {/* Colour is never the only carrier — the dot is paired with words. */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: conf.color }}
          />
          <span className="text-[10px] uppercase tracking-widest text-outline">
            {conf.label}
          </span>
        </div>
      </Link>
    </li>
  );
}

function Headline({ effect }: { effect: MetricEffect }) {
  const sign = effect.delta > 0 ? "+" : "";
  return (
    <p className="text-xs mt-1" data-testid="did-it-work-headline">
      <span className="text-on-surface-variant">{effect.label} </span>
      <span
        className="font-semibold tabular-nums"
        style={{ color: effect.improved ? STATUS.good : STATUS.critical }}
      >
        {sign}
        {effect.delta}
        {effect.unit === "%" ? "" : " "}
        {effect.unit}
      </span>
      {/* Say which way is good, so a falling number is not read as a loss. */}
      <span className="text-outline"> · {effect.improved ? "better" : "worse"}</span>
    </p>
  );
}
