import { useState } from "react";
import type { HealthSummary } from "@health-dashboard/shared";
import { useGoalStore, type Goals } from "../stores/goalStore";

function Ring({
  progress,
  color,
  size = 72,
  strokeWidth = 6,
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
          className="text-gray-100 dark:text-gray-700"
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
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

function GoalRing({
  label,
  current,
  goal,
  unit,
  color,
  format,
}: {
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
  format?: (v: number) => string;
}) {
  const progress = goal > 0 ? current / goal : 0;
  const pctText = Math.round(progress * 100);
  const fmt = format ?? ((v: number) => v.toLocaleString());

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Ring progress={progress} color={color}>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {pctText}%
        </span>
      </Ring>
      <div className="text-center">
        <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
          {fmt(current)}
          <span className="text-gray-400 dark:text-gray-500"> / {fmt(goal)} {unit}</span>
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400">{label}</div>
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
    "w-20 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 text-right";

  return (
    <div className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
      <label className="text-xs text-gray-500 dark:text-gray-400">
        Steps
        <input type="number" value={steps} onChange={(e) => setSteps(Number(e.target.value))} className={inputClass} />
      </label>
      <label className="text-xs text-gray-500 dark:text-gray-400">
        Active min
        <input type="number" value={activeMin} onChange={(e) => setActiveMin(Number(e.target.value))} className={inputClass} />
      </label>
      <label className="text-xs text-gray-500 dark:text-gray-400">
        Sleep hrs
        <input type="number" step="0.5" value={sleepHrs} onChange={(e) => setSleepHrs(Number(e.target.value))} className={inputClass} />
      </label>
      <div className="flex gap-1.5">
        <button
          onClick={() => {
            onSave({ steps, activeMinutes: activeMin, sleepHours: sleepHrs });
            onClose();
          }}
          className="px-3 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Save
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1 text-xs font-medium rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Daily Goals
        </h2>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
        >
          {editing ? "Cancel" : "Edit Goals"}
        </button>
      </div>

      {editing && (
        <div className="mb-4">
          <GoalEditor goals={goals} onSave={setGoals} onClose={() => setEditing(false)} />
        </div>
      )}

      <div className="flex justify-around">
        <GoalRing
          label="Steps"
          current={latestSteps}
          goal={goals.steps}
          unit=""
          color="#6366f1"
        />
        <GoalRing
          label="Active Minutes"
          current={latestActiveMin}
          goal={goals.activeMinutes}
          unit="min"
          color="#10b981"
        />
        <GoalRing
          label="Sleep"
          current={latestSleepHrs}
          goal={goals.sleepHours}
          unit="hrs"
          color="#3b82f6"
          format={(v) => `${v}`}
        />
      </div>
    </div>
  );
}
