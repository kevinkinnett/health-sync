import { useMemo, useState } from "react";

interface DateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const QUICK_PRESETS: { label: string; minutes: number }[] = [
  { label: "Now", minutes: 0 },
  { label: "15m ago", minutes: 15 },
  { label: "30m ago", minutes: 30 },
  { label: "1h ago", minutes: 60 },
  { label: "2h ago", minutes: 120 },
  { label: "Yesterday", minutes: 24 * 60 },
];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function timeStr(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const [viewMonth, setViewMonth] = useState(
    () => new Date(value.getFullYear(), value.getMonth(), 1),
  );

  // Build a stable 6-row × 7-col grid of Dates spanning the view month.
  const days = useMemo(() => {
    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startCol = firstDay.getDay(); // 0 = Sunday
    const cells: Date[] = [];

    // Leading days from the previous month to fill the first row.
    for (let i = startCol - 1; i >= 0; i--) {
      cells.push(new Date(firstDay.getFullYear(), firstDay.getMonth(), -i));
    }

    // Current month days.
    const lastOfMonth = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth() + 1,
      0,
    ).getDate();
    for (let d = 1; d <= lastOfMonth; d++) {
      cells.push(new Date(firstDay.getFullYear(), firstDay.getMonth(), d));
    }

    // Trailing days from the next month to fill out 6 rows × 7 cols.
    while (cells.length < 42) {
      const last = cells[cells.length - 1];
      cells.push(
        new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
      );
    }
    return cells;
  }, [viewMonth]);

  const today = new Date();
  const todayStr = isoDate(today);
  const valueStr = isoDate(value);

  function commit(d: Date) {
    onChange(d);
    if (
      d.getMonth() !== viewMonth.getMonth() ||
      d.getFullYear() !== viewMonth.getFullYear()
    ) {
      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }

  function selectDate(d: Date) {
    // Preserve the current hour/minute when changing the day.
    commit(
      new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        value.getHours(),
        value.getMinutes(),
      ),
    );
  }

  function selectTime(time: string) {
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    onChange(
      new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        h,
        m,
      ),
    );
  }

  function applyPreset(minutes: number) {
    commit(new Date(Date.now() - minutes * 60 * 1000));
  }

  function nextMonth() {
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  function prevMonth() {
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  const monthLabel = viewMonth.toLocaleString([], {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-3">
      {/* Quick presets */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUICK_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.minutes)}
            className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-surface-container-high text-on-surface-variant hover:bg-secondary/20 hover:text-on-surface transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Calendar header */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Previous month"
          className="p-1 text-outline hover:text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-lg">chevron_left</span>
        </button>
        <span className="font-headline font-semibold text-sm text-on-surface">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="Next month"
          className="p-1 text-outline hover:text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-lg">chevron_right</span>
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((d, i) => (
          <div
            key={i}
            className="text-[10px] font-bold text-outline uppercase tracking-wider text-center"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1 mb-3">
        {days.map((d, i) => {
          const ds = isoDate(d);
          const inMonth = d.getMonth() === viewMonth.getMonth();
          const isToday = ds === todayStr;
          const isSelected = ds === valueStr;
          return (
            <button
              type="button"
              key={i}
              onClick={() => selectDate(d)}
              className={`text-xs h-8 rounded-lg tabular-nums transition-colors ${
                isSelected
                  ? "bg-primary text-on-primary-fixed font-bold"
                  : isToday
                    ? "bg-secondary/15 text-secondary font-bold hover:bg-secondary/25"
                    : inMonth
                      ? "text-on-surface hover:bg-surface-container-high"
                      : "text-outline/50 hover:bg-surface-container-high"
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      {/* Time input */}
      <div className="flex items-center gap-3 pt-2 border-t border-outline-variant/10">
        <label className="flex items-center gap-2 flex-1">
          <span className="text-[10px] text-outline uppercase tracking-wider font-bold whitespace-nowrap">
            Time
          </span>
          <input
            type="time"
            value={timeStr(value)}
            onChange={(e) => selectTime(e.target.value)}
            className="flex-1 rounded-lg bg-surface-container-lowest border border-outline-variant/20 px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
          />
        </label>
      </div>
    </div>
  );
}
