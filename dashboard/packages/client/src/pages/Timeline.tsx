import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Intervention, InterventionCategory } from "@health-dashboard/shared";
import {
  useInterventions,
  useDeleteIntervention,
  useRefreshInterventions,
} from "../api/queries";
import { EmptyState, QueryBoundary } from "../components/QueryBoundary";
import { InterventionGantt } from "../components/interventions/InterventionGantt";
import { useUserTimezone } from "../api/queries";
import { todayInTz } from "../lib/userTz";
import { InterventionForm } from "../components/interventions/InterventionForm";
import { ExperimentReportCard } from "../components/interventions/ExperimentReportCard";
import { SERIES } from "../components/charts/chartPalette";
import { PageHeader } from "../components/ui/PageHeader";

/**
 * Timeline — the dated changes you've made, and what each one did.
 *
 * This is the screen the audit said was missing. "Eight Sleep from 2 May"
 * and "Lexapro halved on 8 May" used to live as prose in a notes field,
 * which is why nothing could answer "did it help?". Now they're rows, and
 * selecting one runs the before/after report against them.
 */

const CATEGORY_ICON: Record<InterventionCategory, string> = {
  device: "devices",
  medication: "medication",
  supplement: "nutrition",
  training: "fitness_center",
  diet: "restaurant",
  habit: "repeat",
  other: "label",
};

/** Categories take fixed slots so a colour always means the same thing. */
const CATEGORY_COLOR: Record<InterventionCategory, string> = {
  device: SERIES[0],
  medication: SERIES[1],
  supplement: SERIES[2],
  training: SERIES[3],
  diet: SERIES[4],
  habit: SERIES[5],
  other: SERIES[6],
};

export function Timeline() {
  const q = useInterventions();
  // `?intervention=<id>` opens straight onto a verdict. The home card links
  // here that way, so "did the Eight Sleep help" lands on the answer rather
  // than on a list the reader then has to search.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedId = Number(searchParams.get("intervention"));
  const [selectedId, setSelectedId] = useState<number | null>(
    Number.isInteger(linkedId) && linkedId > 0 ? linkedId : null,
  );
  const [showForm, setShowForm] = useState(false);
  const trainingOnly = searchParams.get("category") === "training";
  const refresh = useRefreshInterventions();
  // An ongoing period has no end date, so the overlap view needs to know
  // where "now" is to draw it as still running.
  const today = todayInTz(useUserTimezone());

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Changes"
        title="Changes & Experiments"
        description="Review what moved after a dated change, distinguish observations from controlled personal experiments, and inspect competing explanations."
        action={<div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="text-xs px-3 py-2 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface disabled:opacity-50"
          >
            {refresh.isPending ? "Scanning…" : "Detect from my data"}
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="text-xs px-3 py-2 rounded-lg bg-primary text-on-primary font-medium"
          >
            {showForm ? "Cancel" : "Add change"}
          </button>
        </div>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container-low p-3">
        <div className="flex gap-2" role="group" aria-label="Change category">
          <FilterButton
            active={!trainingOnly}
            onClick={() => {
              setSelectedId(null);
              setSearchParams({});
            }}
          >
            All changes
          </FilterButton>
          <FilterButton
            active={trainingOnly}
            onClick={() => {
              setSelectedId(null);
              setSearchParams({ category: "training" });
            }}
          >
            Training programs
          </FilterButton>
        </div>
        <Link
          to="/analytics/correlations"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
        >
          See repeated workout-day effects
          <span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_forward</span>
        </Link>
      </div>

      {showForm && <InterventionForm onDone={() => setShowForm(false)} />}

      <QueryBoundary
        query={q}
        empty={
          <EmptyState
            icon="timeline"
            message="No changes recorded yet. Add one — a device, a dose, a programme — or let the app detect what your logged data already implies."
          />
        }
        isEmpty={(d) => d.length === 0}
      >
        {(items) => {
          const visibleItems = trainingOnly
            ? items.filter((item) => item.category === "training")
            : items;
          if (visibleItems.length === 0) {
            return <EmptyState icon="fitness_center" message="No training-program changes are recorded yet. Add the date a program began or changed to analyze longer-term adaptation." />;
          }
          return (
          <div className="space-y-4">
            <InterventionGantt
              interventions={visibleItems}
              today={today}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
            />
            {/* Named, because the overlap bars above render the same
                intervention names — a bare text query now matches both. */}
            <div className="space-y-3" data-testid="intervention-list">
              {visibleItems.map((item) => (
                <InterventionRow
                  key={item.id}
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={() =>
                    setSelectedId((cur) => (cur === item.id ? null : item.id))
                  }
                />
              ))}
            </div>
          </div>
          );
        }}
      </QueryBoundary>

      {selectedId != null && <ExperimentReportCard interventionId={selectedId} />}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
        active ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"
      }`}
    >
      {children}
    </button>
  );
}

function InterventionRow({
  item,
  selected,
  onSelect,
}: {
  item: Intervention;
  selected: boolean;
  onSelect: () => void;
}) {
  const del = useDeleteIntervention();
  const color = CATEGORY_COLOR[item.category];
  const ongoing = item.kind === "period" && item.endedOn == null;

  return (
    <div
      className={`bg-surface-container rounded-xl border transition-colors ${
        selected ? "border-primary/60" : "border-outline-variant/10"
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        <span
          className="material-symbols-outlined text-lg shrink-0"
          style={{ color }}
          aria-hidden="true"
        >
          {CATEGORY_ICON[item.category]}
        </span>

        <button
          type="button"
          onClick={onSelect}
          aria-expanded={selected}
          className="flex-1 text-left min-w-0"
        >
          <span className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-on-surface">
              {item.name}
            </span>
            {item.source === "derived" && (
              <span
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-high text-outline"
                title="Inferred from your logged data — edit the underlying entries to change it"
              >
                detected
              </span>
            )}
          </span>
          <span className="block text-xs text-outline tabular-nums mt-0.5">
            {item.startedOn}
            {item.kind === "period" && (ongoing ? " → now" : ` → ${item.endedOn}`)}
            {item.detail ? ` · ${item.detail}` : ""}
          </span>
        </button>

        {item.source === "manual" && (
          <button
            type="button"
            onClick={() => del.mutate(item.id)}
            disabled={del.isPending}
            aria-label={`Delete ${item.name}`}
            className="material-symbols-outlined text-base text-outline hover:text-error disabled:opacity-40 shrink-0"
          >
            delete
          </button>
        )}
      </div>
    </div>
  );
}
