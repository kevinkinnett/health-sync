import { useId, useState, type ReactNode } from "react";
import { formatDose } from "../../lib/dose";
import { SectionError, SectionLoading } from "./IntakeSectionState";
import {
  HISTORY_PRESETS,
  type HistoryRange,
  type IntakeLogEntryBase,
} from "./logModel";

export function IntakeTimelineSection<T extends IntakeLogEntryBase>({
  title,
  emptyMessage,
  entries,
  icon,
  iconClass,
  loading = false,
  error = null,
  onRetry,
  deletingId,
  onDelete,
  formatTime,
  range,
  onRangeChange,
  details,
}: {
  title: string;
  emptyMessage: string;
  entries: T[];
  icon: string;
  iconClass: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  deletingId: number | null;
  onDelete: (id: number) => Promise<void>;
  formatTime: (takenAt: string) => string;
  range?: HistoryRange;
  onRangeChange?: (range: HistoryRange) => void;
  details?: (entry: T) => { summary: string; content: ReactNode } | null;
}) {
  return (
    <section className="bg-surface-container rounded-xl p-4 sm:p-5 border border-outline-variant/10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="font-headline text-lg font-semibold text-on-surface">
          {title}
        </h2>
        {range && onRangeChange && (
          <HistoryRangePicker value={range} onChange={onRangeChange} />
        )}
      </div>
      {loading ? (
        <SectionLoading label={`Loading ${title.toLowerCase()}…`} />
      ) : error && onRetry ? (
        <SectionError
          message={error}
          actionLabel={`Retry loading ${title.toLowerCase()}`}
          onRetry={onRetry}
        />
      ) : entries.length === 0 ? (
        <p className="text-on-surface-variant text-sm">{emptyMessage}</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <IntakeEntryRow
              key={entry.id}
              entry={entry}
              icon={icon}
              iconClass={iconClass}
              time={formatTime(entry.takenAt)}
              deleting={deletingId === entry.id}
              onDelete={() => onDelete(entry.id)}
              details={details?.(entry) ?? null}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryRangePicker({
  value,
  onChange,
}: {
  value: HistoryRange;
  onChange: (range: HistoryRange) => void;
}) {
  return (
    <div
      role="group"
      aria-label="History range"
      className="grid grid-cols-4 bg-surface-container-low p-1 rounded-xl border border-outline-variant/10"
    >
      {HISTORY_PRESETS.map((preset) => (
        <button
          key={preset.value}
          type="button"
          onClick={() => onChange(preset.value)}
          aria-pressed={value === preset.value}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
            value === preset.value
              ? "bg-primary text-on-primary-fixed"
              : "text-outline hover:text-on-surface"
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

function IntakeEntryRow<T extends IntakeLogEntryBase>({
  entry,
  icon,
  iconClass,
  time,
  deleting,
  onDelete,
  details,
}: {
  entry: T;
  icon: string;
  iconClass: string;
  time: string;
  deleting: boolean;
  onDelete: () => Promise<void>;
  details: { summary: string; content: ReactNode } | null;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  const remove = async () => {
    setDeleteError(null);
    try {
      await onDelete();
      setConfirmingDelete(false);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "The intake could not be deleted.",
      );
    }
  };

  return (
    <article className="bg-surface-container-low rounded-xl overflow-hidden">
      <div className="p-3 flex items-start sm:items-center gap-3">
        <span
          className={`material-symbols-outlined ${iconClass} mt-0.5 sm:mt-0`}
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-headline font-semibold text-sm text-on-surface truncate">
            {entry.itemName}
          </p>
          <p className="text-xs text-on-surface-variant tabular-nums">
            {time} <span aria-hidden="true">·</span>{" "}
            <span className="text-on-surface">
              {formatDose(entry.amount, entry.unit)}
            </span>
          </p>
          {entry.notes && (
            <p className="text-xs text-outline mt-1 break-words">{entry.notes}</p>
          )}
          {details && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
              aria-controls={detailsId}
              className="mt-1 text-[11px] text-outline hover:text-on-surface flex items-center gap-1 rounded focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                {expanded ? "expand_less" : "expand_more"}
              </span>
              {details.summary}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setConfirmingDelete(true);
            setDeleteError(null);
          }}
          disabled={deleting}
          className="h-10 w-10 shrink-0 text-outline hover:text-error hover:bg-error/10 rounded-lg flex items-center justify-center disabled:opacity-50"
          aria-label={`Delete ${entry.itemName} intake at ${time}`}
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            delete
          </span>
        </button>
      </div>

      {details && expanded && (
        <div
          id={detailsId}
          className="px-3 pb-3 border-t border-outline-variant/10 pt-2"
        >
          {details.content}
        </div>
      )}

      {confirmingDelete && (
        <div className="px-3 pb-3 border-t border-outline-variant/10 pt-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-on-surface-variant">
              Delete this {entry.itemName} intake? This cannot be undone.
            </p>
            <div className="grid grid-cols-2 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="px-3 py-2 text-xs font-bold text-outline rounded-lg hover:bg-surface-container-high disabled:opacity-50"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={deleting}
                className="px-3 py-2 text-xs font-bold text-error bg-error/10 rounded-lg hover:bg-error/20 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : deleteError ? "Try again" : "Delete"}
              </button>
            </div>
          </div>
          {deleteError && (
            <p role="alert" className="text-xs text-error mt-2">
              Could not delete this intake: {deleteError}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
