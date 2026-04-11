import { create } from "zustand";

export interface Goals {
  steps: number;
  activeMinutes: number;
  sleepHours: number;
}

const DEFAULT_GOALS: Goals = {
  steps: 8000,
  activeMinutes: 30,
  sleepHours: 7,
};

function loadGoals(): Goals {
  try {
    const stored = localStorage.getItem("health-goals");
    if (stored) return { ...DEFAULT_GOALS, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return DEFAULT_GOALS;
}

interface GoalState {
  goals: Goals;
  setGoals: (goals: Partial<Goals>) => void;
}

export const useGoalStore = create<GoalState>((set) => ({
  goals: loadGoals(),
  setGoals: (partial) =>
    set((state) => {
      const goals = { ...state.goals, ...partial };
      localStorage.setItem("health-goals", JSON.stringify(goals));
      return { goals };
    }),
}));
