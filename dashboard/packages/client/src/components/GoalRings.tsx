import { useState } from "react";
import type { HealthSummary } from "@health-dashboard/shared";
import { useGoalStore, type Goals } from "../stores/goalStore";

function Ring({
  progress,
  color,
  size = 96,
  strokeWidth = 8,
  children,
}: {
  progress: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  children: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(progress, 1);
  const offset = circumference * (1 - pct);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-surface-container"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

function GoalEditor({
  goals,
  onSave,
  onClose,
}: {
  goals: Goals;
  onSave: (goals: Partial<Goals>) => void;
  onClose: () => void;
}) {
  const [steps, setSteps] = useState(goals.steps);
  const [activeMin, setActiveMin] = useState(goals.activeMinutes);
  const [sleepHrs, setSleepHrs] = useState(goals.sleepHours);

  const inputClass =
    "w-20 rounded-lg bg-surface-container-lowest border-none px-2 py-1 text-sm text-on-surface text-right font-mono tabular-nums focus:ring-1 focus:ring-primary";

  return (
    <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-surface-container-low border border-outline-variant/10">
      <label className="text-[10px] text-outline uppercase tracking-wider font-bold">
        Steps
        <input type="number" value={steps} onChange={(e) => setSteps(Number(e.target.value))} className={inputClass} />
      </label>
      <label className="text-[10px] text-outline uppercase tracking-wider font-bold">
        Active min
        <input type="number" value={activeMin} onChange={(e) => setActiveMin(Number(e.target.value))} className={inputClass} />
      </label>
      <label className="text-[10px] text-outline uppercase tracking-wider font-bold">
        Sleep hrs
        <input type="number" step="0.5" value={sleepHrs} onChange={(e) => setSleepHrs(Number(e.target.value))} className={inputClass} />
      </label>
      <div className="flex gap-1.5">
        <button
          onClick={() => {
            onSave({ steps, activeMinutes: activeMin, sleepHours: sleepHrs });
            onClose();
          }}
          className="px-4 py-1.5 text-xs font-bold rounded-lg bg-linear-to-br from-primary to-primary-container text-on-primary-fixed shadow-lg shadow-primary/10 active:scale-95 transition-transform"
        >
          Save
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-bold rounded-lg text-outline hover:bg-surface-container-high transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function GoalRings({ summary }: { summary: HealthSummary }) {
  const { goals, setGoals } = useGoalStore();
  const [editing, setEditing] = useState(false);

  const latestSteps = summary.activity.latest?.steps ?? 0;
  const latestActiveMin =
    ((summary.activity.latest?.minutesFairlyActive ?? 0) +
      (summary.activity.latest?.minutesVeryActive ?? 0));
  const latestSleepHrs = summary.sleep.latest?.totalMinutesAsleep != null
    ? Math.round((summary.sleep.latest.totalMinutesAsleep / 60) * 10) / 10
    : 0;

  const stepsPct = goals.steps > 0 ? latestSteps / goals.steps : 0;

  return (
    <div className="bg-surface-container-high rounded-xl p-6 flex flex-col justify-between h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-headline font-semibold text-on-surface">
          Daily Goals
        </h2>
        <button
          onClick={() => setEditing(!editing)}
          className="text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined">more_horiz</span>
        </button>
      </div>

      {editing && (
        <div className="mb-4">
          <GoalEditor goals={goals} onSave={setGoals} onClose={() => setEditing(false)} />
        </div>
      )}

      <div className="flex items-center justify-around py-4">
        {/* Main steps ring */}
        <Ring progress={stepsPct} color="#c0c1ff" size={128} strokeWidth={8}>
          <span
            className="material-symbols-outlined text-primary text-xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            directions_run
          </span>
          <span className="text-sm font-bold tabular-nums text-on-surface">
            {Math.round(stepsPct * 100)}%
          </span>
        </Ring>

        {/* Legend */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <div>
              <p className="text-[10px] text-outline uppercase font-bold tracking-widest">Steps</p>
              <p className="text-xs font-bold tabular-nums text-on-surface">
                {(latestSteps / 1000).toFixed(1)}k / {(goals.steps / 1000).toFixed(0)}k
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-secondary" />
            <div>
              <p className="text-[10px] text-outline uppercase font-bold tracking-widest">Active</p>
              <p className="text-xs font-bold tabular-nums text-on-surface">
                {latestActiveMin} / {goals.activeMinutes}m
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-tertiary" />
            <div>
              <p className="text-[10px] text-outline uppercase font-bold tracking-widest">Sleep</p>
              <p className="text-xs font-bold tabular-nums text-on-surface">
                {latestSleepHrs} / {goals.sleepHours}h
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
