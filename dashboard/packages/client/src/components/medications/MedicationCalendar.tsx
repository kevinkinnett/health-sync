import { useMemo, useState } from "react";
import type { MedicationIntake, MedicationItem } from "@health-dashboard/shared";
import {
  useMedicationIntakes,
  useLogMedicationIntake,
  useDeleteMedicationIntake,
} from "../../api/queries";
import { formatDose } from "../../lib/dose";

const WEEKDAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

// Backfilled doses are stamped at 8:00 AM local. Adherence counts days, not
// times, so the hour is cosmetic — but a consistent one keeps timelines tidy.
const BACKFILL_HOUR = 8;

function dayLabel(d: Date): string {
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Local-day key (YYYY-MM-DD in the browser's timezone). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

interface MedicationCalendarProps {
  items: MedicationItem[];
}

/**
 * Month calendar for backfilling/correcting daily medication intakes.
 * Tap an empty day to log the selected medication at its default dose;
 * tap a logged day to remove that day's intake(s). Future days are
 * disabled. Intended for the common "I've been taking X every day but
 * never logged it" case — one tap per day, no form.
 */
export function MedicationCalendar({ items }: MedicationCalendarProps) {
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month, negative = past
  const [pendingDay, setPendingDay] = useState<string | null>(null);

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
  const del = useDeleteMedicationIntake();

  const byDay = useMemo(() => {
    const map = new Map<string, MedicationIntake[]>();
    for (const intake of intakes.data ?? []) {
      const key = dayKey(new Date(intake.takenAt));
      const list = map.get(key);
      if (list) list.push(intake);
      else map.set(key, [intake]);
    }
    return map;
  }, [intakes.data]);

  if (items.length === 0) return null;

  function handleDayClick(date: Date, logged: MedicationIntake[] | undefined) {
    if (!item) return;
    const key = dayKey(date);
    if (logged && logged.length > 0) {
      const what =
        logged.length === 1
          ? `the intake of ${item.name}`
          : `all ${logged.length} intakes of ${item.name}`;
      if (!confirm(`Remove ${what} on ${dayLabel(date)}?`)) return;
      setPendingDay(key);
      Promise.allSettled(logged.map((i) => del.mutateAsync(i.id))).finally(() =>
        setPendingDay(null),
      );
    } else {
      const takenAt = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        BACKFILL_HOUR,
      );
      setPendingDay(key);
      // amount/unit omitted — the server substitutes the item's defaults.
      log.mutate(
        { itemId: item.id, takenAt: takenAt.toISOString() },
        { onSettled: () => setPendingDay(null) },
      );
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

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h2 className="font-headline text-lg font-semibold text-on-surface">
          Calendar
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonthOffset((o) => o - 1)}
            aria-label="Previous month"
            className="text-outline hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <span className="text-sm font-semibold text-on-surface tabular-nums min-w-28 text-center">
            {viewMonth.toLocaleDateString([], { month: "long", year: "numeric" })}
          </span>
          <button
            onClick={() => setMonthOffset((o) => Math.min(0, o + 1))}
            disabled={monthOffset >= 0}
            aria-label="Next month"
            className="text-outline hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
        </div>
      </div>
      <p className="text-xs text-on-surface-variant mb-3">
        Tap a day to log{" "}
        <span className="text-on-surface font-semibold">
          {item?.name} ({formatDose(item?.defaultAmount ?? null, item?.defaultUnit ?? "")})
        </span>{" "}
        · tap a logged day to remove it.
      </p>

      {items.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {items.map((i) => (
            <button
              key={i.id}
              onClick={() => setSelectedItemId(i.id)}
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
          const ariaLabel = isLogged
            ? `Remove ${logged!.length} intake${logged!.length > 1 ? "s" : ""} of ${item?.name} on ${dayLabel(date)}`
            : `Log ${item?.name} on ${dayLabel(date)}`;
          return (
            <button
              key={key}
              onClick={() => handleDayClick(date, logged)}
              disabled={isFuture || isPending || !item}
              aria-label={ariaLabel}
              className={`aspect-square rounded-lg text-xs tabular-nums flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isLogged
                  ? "bg-tertiary/20 text-on-surface font-bold hover:bg-error/15"
                  : isFuture
                    ? "text-outline/30"
                    : "bg-surface-container-low text-on-surface-variant hover:bg-tertiary/10"
              } ${isToday ? "ring-1 ring-primary" : ""} ${isPending ? "animate-pulse" : ""}`}
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

      {(log.isError || del.isError) && (
        <p className="mt-3 text-xs text-error">
          {log.isError
            ? "Failed to log intake — if this medication has no default amount, set one in the Library tab first."
            : "Failed to remove intake. Please try again."}
        </p>
      )}
    </div>
  );
}
