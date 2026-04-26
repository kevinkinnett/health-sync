import { useMemo, useState } from "react";
import type { SupplementItem } from "@health-dashboard/shared";
import {
  useSupplementItems,
  useSupplementIntakes,
  useLogSupplementIntake,
  useDeleteSupplementIntake,
} from "../../api/queries";

const inputClass =
  "w-full rounded-lg bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-[10px] text-outline uppercase tracking-wider font-bold mb-1 block";

type HistoryRange = "7d" | "30d" | "90d" | "all";

const HISTORY_PRESETS: { label: string; value: HistoryRange }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

function rangeToSinceIso(range: HistoryRange): string | undefined {
  if (range === "all") return undefined;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // Date-only floor so the query key is stable until the calendar day
  // rolls over, not changing on every render.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function formatDose(amount: number | null, unit: string): string {
  if (amount == null) return `— ${unit}`;
  // Trim trailing zeros for whole-number doses (e.g. "1000" not "1000.000")
  const formatted =
    Number.isInteger(amount) ? String(amount) : String(parseFloat(amount.toFixed(3)));
  return `${formatted} ${unit}`;
}

function toDatetimeLocalValue(iso: string): string {
  // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in *local* time.
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value: string): string {
  // Treat the string as local time, convert to ISO with timezone.
  return new Date(value).toISOString();
}

interface ConfirmSheetProps {
  item: SupplementItem;
  onClose: () => void;
}

function ConfirmSheet({ item, onClose }: ConfirmSheetProps) {
  // Default: omit takenAt entirely so the server uses NOW(). The user can
  // opt into a custom timestamp via "Adjust time". This avoids the
  // datetime-local local↔UTC round-trip which has been observed to flip
  // 13 hours in some browser/locale combinations.
  const [adjustTime, setAdjustTime] = useState(false);
  const [takenAt, setTakenAt] = useState(() =>
    toDatetimeLocalValue(new Date().toISOString()),
  );
  const [amount, setAmount] = useState<string>(
    item.defaultAmount != null ? String(item.defaultAmount) : "",
  );
  const [unit, setUnit] = useState(item.defaultUnit);
  const [notes, setNotes] = useState("");
  const log = useLogSupplementIntake();

  function handleConfirm() {
    const amountNum = amount.trim() === "" ? undefined : Number(amount);
    if (amountNum != null && Number.isNaN(amountNum)) return;
    log.mutate(
      {
        itemId: item.id,
        // Only send takenAt if user explicitly chose to adjust it.
        takenAt: adjustTime ? fromDatetimeLocalValue(takenAt) : undefined,
        amount: amountNum,
        unit: unit.trim() || undefined,
        notes: notes.trim() ? notes.trim() : null,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="bg-surface-container-high rounded-2xl p-5 border border-outline-variant/10">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="material-symbols-outlined text-secondary"
          style={{ fontVariationSettings: "'FILL' 1", fontSize: 28 }}
        >
          medication
        </span>
        <div>
          <h3 className="font-headline font-bold text-on-surface">
            Logging {item.name}
          </h3>
          <p className="text-xs text-outline">
            Default: {formatDose(item.defaultAmount, item.defaultUnit)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <label className="flex flex-col">
          <span className={labelClass}>Amount</span>
          <input
            type="number"
            step="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} tabular-nums`}
          />
        </label>
        <label className="flex flex-col">
          <span className={labelClass}>Unit</span>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <label className="flex flex-col mb-3">
        <span className={labelClass}>Notes (optional)</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. with breakfast"
          className={inputClass}
        />
      </label>
      <div className="mb-4">
        {adjustTime ? (
          <label className="flex flex-col">
            <span className={labelClass}>Taken at</span>
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={takenAt}
                onChange={(e) => setTakenAt(e.target.value)}
                className={inputClass}
              />
              <button
                onClick={() => setAdjustTime(false)}
                className="text-xs text-outline hover:text-on-surface px-2 py-1"
              >
                Use now
              </button>
            </div>
          </label>
        ) : (
          <button
            onClick={() => setAdjustTime(true)}
            className="text-xs text-outline hover:text-on-surface flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">schedule</span>
            Logging as <span className="text-on-surface font-semibold">now</span> · Adjust time
          </button>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 text-xs font-bold rounded-lg text-outline hover:bg-surface-container-high transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={log.isPending}
          className="px-5 py-2 text-xs font-bold rounded-lg bg-linear-to-br from-primary to-primary-container text-on-primary-fixed shadow-lg shadow-primary/10 active:scale-95 transition-transform disabled:opacity-50"
        >
          {log.isPending ? "Logging…" : "Confirm"}
        </button>
      </div>
      {log.isError && (
        <p className="mt-3 text-xs text-error">
          Failed to log intake. Please try again.
        </p>
      )}
    </div>
  );
}

function IntakeRow({ id, label, time, dose, notes }: {
  id: number;
  label: string;
  time: string;
  dose: string;
  notes: string | null;
}) {
  const del = useDeleteSupplementIntake();
  return (
    <div className="bg-surface-container-low rounded-xl p-3 flex items-center gap-3">
      <span
        className="material-symbols-outlined text-secondary"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        medication
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-headline font-semibold text-sm text-on-surface truncate">
          {label}
        </p>
        <p className="text-xs text-on-surface-variant tabular-nums">
          {time} · <span className="text-on-surface">{dose}</span>
          {notes ? ` · ${notes}` : ""}
        </p>
      </div>
      <button
        onClick={() => {
          if (confirm("Delete this intake entry?")) del.mutate(id);
        }}
        disabled={del.isPending}
        className="text-outline hover:text-error transition-colors p-1"
        aria-label="Delete intake"
      >
        <span className="material-symbols-outlined text-base">delete</span>
      </button>
    </div>
  );
}

export function SupplementLog() {
  const items = useSupplementItems();
  const [selected, setSelected] = useState<SupplementItem | null>(null);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("30d");

  // Pull intakes for the selected history range. Use a date-only stable
  // string so the query key only changes when the calendar day rolls over
  // or the range changes, not on every render (which would otherwise cause
  // refetch storms).
  const since = useMemo(() => rangeToSinceIso(historyRange), [historyRange]);
  const intakes = useSupplementIntakes(since);

  const todayStart = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  }, []);

  const todayIntakes =
    intakes.data?.filter((i) => new Date(i.takenAt).getTime() >= todayStart) ?? [];
  const olderIntakes =
    intakes.data?.filter((i) => new Date(i.takenAt).getTime() < todayStart) ?? [];

  return (
    <div className="space-y-6">
      {/* Quick-log grid */}
      <div className="bg-surface-container rounded-xl p-5">
        <h2 className="font-headline text-lg font-semibold text-on-surface mb-4">
          Quick log
        </h2>
        {items.isLoading ? (
          <p className="text-on-surface-variant">Loading…</p>
        ) : items.data && items.data.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {items.data.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="bg-surface-container-high hover:bg-secondary/10 rounded-xl p-4 text-left transition-colors group"
              >
                <span
                  className="material-symbols-outlined text-secondary mb-2 block group-hover:scale-110 transition-transform"
                  style={{ fontVariationSettings: "'FILL' 1", fontSize: 28 }}
                >
                  medication
                </span>
                <p className="font-headline font-semibold text-on-surface truncate">
                  {item.name}
                </p>
                <p className="text-xs text-on-surface-variant tabular-nums">
                  {formatDose(item.defaultAmount, item.defaultUnit)}
                </p>
                {item.brand && (
                  <p className="text-[10px] text-outline uppercase tracking-wider mt-1 truncate">
                    {item.brand}
                  </p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-on-surface-variant text-sm">
            No supplements yet. Add some in the Library tab.
          </p>
        )}
      </div>

      {/* Confirm sheet */}
      {selected && (
        <ConfirmSheet item={selected} onClose={() => setSelected(null)} />
      )}

      {/* Today timeline */}
      <div className="bg-surface-container rounded-xl p-5">
        <h2 className="font-headline text-lg font-semibold text-on-surface mb-4">
          Today
        </h2>
        {todayIntakes.length === 0 ? (
          <p className="text-on-surface-variant text-sm">
            Nothing logged yet today.
          </p>
        ) : (
          <div className="space-y-2">
            {todayIntakes.map((i) => (
              <IntakeRow
                key={i.id}
                id={i.id}
                label={i.itemName}
                time={new Date(i.takenAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                dose={formatDose(i.amount, i.unit)}
                notes={i.notes}
              />
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-surface-container rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="font-headline text-lg font-semibold text-on-surface">
            History
          </h2>
          <div className="flex items-center gap-1 bg-surface-container-low px-1.5 py-1 rounded-xl border border-outline-variant/10">
            {HISTORY_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setHistoryRange(p.value)}
                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  historyRange === p.value
                    ? "bg-primary text-on-primary-fixed"
                    : "text-outline hover:text-on-surface"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {intakes.isLoading ? (
          <p className="text-on-surface-variant text-sm">Loading…</p>
        ) : olderIntakes.length === 0 ? (
          <p className="text-on-surface-variant text-sm">
            No history in this range.
          </p>
        ) : (
          <div className="space-y-2">
            {olderIntakes.map((i) => (
              <IntakeRow
                key={i.id}
                id={i.id}
                label={i.itemName}
                time={new Date(i.takenAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                dose={formatDose(i.amount, i.unit)}
                notes={i.notes}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
