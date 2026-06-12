import { useMemo, useState } from "react";
import type { MedicationIntake, MedicationItem } from "@health-dashboard/shared";
import {
  useMedicationIntakes,
  useLogMedicationIntake,
  useUpdateMedicationIntake,
  useDeleteMedicationIntake,
} from "../../api/queries";
import { formatDose } from "../../lib/dose";

const WEEKDAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

// Backfilled doses are stamped at 8:00 AM local. Adherence counts days, not
// times, so the hour is cosmetic — but a consistent one keeps timelines tidy.
const BACKFILL_HOUR = 8;

const inputClass =
  "w-full rounded-lg bg-surface-container-lowest border border-outline-variant/20 px-2 py-1.5 text-sm text-on-surface tabular-nums focus:outline-none focus:ring-1 focus:ring-primary";

function dayLabel(d: Date): string {
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Local-day key (YYYY-MM-DD in the browser's timezone). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** One editable intake row inside the day detail sheet. */
function DayIntakeRow({ intake }: { intake: MedicationIntake }) {
  const [amount, setAmount] = useState(String(intake.amount));
  const [unit, setUnit] = useState(intake.unit);
  const update = useUpdateMedicationIntake();
  const del = useDeleteMedicationIntake();

  const amountNum = Number(amount);
  const amountValid = amount.trim() !== "" && !Number.isNaN(amountNum) && amountNum >= 0;
  const dirty = amountNum !== intake.amount || unit.trim() !== intake.unit;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-on-surface-variant tabular-nums w-16 shrink-0">
        {timeLabel(intake.takenAt)}
      </span>
      <input
        type="number"
        step="0.001"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label={`Amount for intake at ${timeLabel(intake.takenAt)}`}
        className={inputClass}
      />
      <input
        type="text"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        aria-label={`Unit for intake at ${timeLabel(intake.takenAt)}`}
        className={inputClass}
      />
      <button
        onClick={() =>
          update.mutate({
            id: intake.id,
            body: { amount: amountNum, unit: unit.trim() },
          })
        }
        disabled={!dirty || !amountValid || unit.trim() === "" || update.isPending}
        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-primary text-on-primary-fixed disabled:opacity-30 transition-opacity shrink-0"
      >
        {update.isPending ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => {
          if (confirm(`Delete the ${formatDose(intake.amount, intake.unit)} intake at ${timeLabel(intake.takenAt)}?`)) {
            del.mutate(intake.id);
          }
        }}
        disabled={del.isPending}
        aria-label={`Delete intake at ${timeLabel(intake.takenAt)}`}
        className="text-outline hover:text-error transition-colors p-1 shrink-0"
      >
        <span className="material-symbols-outlined text-base">delete</span>
      </button>
    </div>
  );
}

interface MedicationCalendarProps {
  items: MedicationItem[];
}

/**
 * Month calendar for backfilling/correcting daily medication intakes.
 * Tapping an empty day logs the selected medication at its default dose;
 * tapping a logged day opens a detail sheet showing each intake's dose
 * and time, editable in place (PATCH), with per-intake delete and an
 * "add dose" for that day. Future days are disabled.
 */
export function MedicationCalendar({ items }: MedicationCalendarProps) {
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month, negative = past
  const [pendingDay, setPendingDay] = useState<string | null>(null);
  const [detailDay, setDetailDay] = useState<string | null>(null);

  const item = items.find((i) => i.id === selectedItemId) ?? items[0] ?? null;

  const today = new Date();
  const todayKey = dayKey(today);
  const viewMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const monthEnd = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  const daysInMonth = monthEnd.getDate();

  const intakes = useMedicationIntakes(
    monthStart.toISOString(),
    monthEnd.toISOString(),
    item?.id,
  );
  const log = useLogMedicationIntake();

  const byDay = useMemo(() => {
    const map = new Map<string, MedicationIntake[]>();
    for (const intake of intakes.data ?? []) {
      const key = dayKey(new Date(intake.takenAt));
      const list = map.get(key);
      if (list) list.push(intake);
      else map.set(key, [intake]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.takenAt < b.takenAt ? -1 : 1));
    }
    return map;
  }, [intakes.data]);

  if (items.length === 0) return null;

  function logDay(dateKeyParts: { y: number; m: number; d: number }) {
    if (!item) return;
    const takenAt = new Date(dateKeyParts.y, dateKeyParts.m, dateKeyParts.d, BACKFILL_HOUR);
    setPendingDay(dayKey(takenAt));
    // amount/unit omitted — the server substitutes the item's defaults.
    log.mutate(
      { itemId: item.id, takenAt: takenAt.toISOString() },
      { onSettled: () => setPendingDay(null) },
    );
  }

  function handleDayClick(date: Date, logged: MedicationIntake[] | undefined) {
    if (!item) return;
    if (logged && logged.length > 0) {
      setDetailDay(dayKey(date)); // view/edit doses for the day
    } else {
      logDay({ y: date.getFullYear(), m: date.getMonth(), d: date.getDate() });
    }
  }

  const leadingBlanks = monthStart.getDay();
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1),
    ),
  ];

  const detailIntakes = detailDay ? (byDay.get(detailDay) ?? []) : [];
  let detailDate: Date | null = null;
  if (detailDay) {
    const [y, m, d] = detailDay.split("-").map(Number);
    detailDate = new Date(y, m - 1, d);
  }

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h2 className="font-headline text-lg font-semibold text-on-surface">
          Calendar
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setMonthOffset((o) => o - 1);
              setDetailDay(null);
            }}
            aria-label="Previous month"
            className="text-outline hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <span className="text-sm font-semibold text-on-surface tabular-nums min-w-28 text-center">
            {viewMonth.toLocaleDateString([], { month: "long", year: "numeric" })}
          </span>
          <button
            onClick={() => {
              setMonthOffset((o) => Math.min(0, o + 1));
              setDetailDay(null);
            }}
            disabled={monthOffset >= 0}
            aria-label="Next month"
            className="text-outline hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
        </div>
      </div>
      <p className="text-xs text-on-surface-variant mb-3">
        Tap an empty day to log{" "}
        <span className="text-on-surface font-semibold">
          {item?.name} ({formatDose(item?.defaultAmount ?? null, item?.defaultUnit ?? "")})
        </span>{" "}
        · tap a logged day to view or edit its doses.
      </p>

      {items.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {items.map((i) => (
            <button
              key={i.id}
              onClick={() => {
                setSelectedItemId(i.id);
                setDetailDay(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                i.id === item?.id
                  ? "bg-tertiary text-on-tertiary"
                  : "bg-surface-container-low text-outline hover:text-on-surface"
              }`}
            >
              {i.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {WEEKDAY_HEADERS.map((w, idx) => (
          <span
            key={`${w}-${idx}`}
            className="text-[10px] text-outline uppercase tracking-wider font-bold"
          >
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, idx) => {
          if (!date) return <span key={`blank-${idx}`} />;
          const key = dayKey(date);
          const logged = byDay.get(key);
          const isLogged = (logged?.length ?? 0) > 0;
          const isFuture = key > todayKey;
          const isToday = key === todayKey;
          const isPending = pendingDay === key;
          const isOpen = detailDay === key;
          const ariaLabel = isLogged
            ? `View ${logged!.length} intake${logged!.length > 1 ? "s" : ""} of ${item?.name} on ${dayLabel(date)}`
            : `Log ${item?.name} on ${dayLabel(date)}`;
          const doseSummary = isLogged
            ? logged!
                .map((i) => `${formatDose(i.amount, i.unit)} at ${timeLabel(i.takenAt)}`)
                .join(", ")
            : undefined;
          return (
            <button
              key={key}
              onClick={() => handleDayClick(date, logged)}
              disabled={isFuture || isPending || !item}
              aria-label={ariaLabel}
              title={doseSummary}
              className={`aspect-square rounded-lg text-xs tabular-nums flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isLogged
                  ? "bg-tertiary/20 text-on-surface font-bold hover:bg-tertiary/30"
                  : isFuture
                    ? "text-outline/30"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-tertiary/10"
              } ${isToday ? "ring-1 ring-primary" : ""} ${isOpen ? "ring-2 ring-tertiary" : ""} ${isPending ? "animate-pulse" : ""}`}
            >
              <span>{date.getDate()}</span>
              {isLogged && (
                <span
                  className="material-symbols-outlined text-tertiary"
                  style={{ fontVariationSettings: "'FILL' 1", fontSize: 12 }}
                >
                  check_circle
                </span>
              )}
              {isLogged && logged!.length > 1 && (
                <span className="text-[9px] text-tertiary -mt-0.5">×{logged!.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {detailDay && detailDate && detailIntakes.length > 0 && (
        <div className="mt-4 bg-surface-container-high rounded-2xl p-4 border border-outline-variant/10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-headline font-bold text-sm text-on-surface">
              {detailDate.toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}{" "}
              · {item?.name}
            </h3>
            <button
              onClick={() => setDetailDay(null)}
              aria-label="Close day details"
              className="text-outline hover:text-on-surface p-1"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
          <div className="space-y-2 mb-3">
            {detailIntakes.map((i) => (
              <DayIntakeRow key={i.id} intake={i} />
            ))}
          </div>
          <button
            onClick={() => {
              const [y, m, d] = detailDay.split("-").map(Number);
              logDay({ y, m: m - 1, d });
            }}
            disabled={log.isPending}
            className="text-xs font-bold text-tertiary hover:text-on-surface flex items-center gap-1 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Add dose ({formatDose(item?.defaultAmount ?? null, item?.defaultUnit ?? "")})
          </button>
        </div>
      )}

      {log.isError && (
        <p className="mt-3 text-xs text-error">
          Failed to log intake — if this medication has no default amount, set
          one in the Library tab first.
        </p>
      )}
    </div>
  );
}
