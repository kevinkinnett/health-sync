import { Link } from "react-router-dom";
import {
  useDayOfWeekHeatmap,
  useHealthSummary,
  useWeeklyInsights,
} from "../../api/queries";
import { DayOfWeekHeatmap } from "../../components/DayOfWeekHeatmap";
import { GoalRings } from "../../components/GoalRings";
import { WeeklyInsights } from "../../components/WeeklyInsights";

const jumpCards: Array<{
  to: string;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    to: "../activity",
    label: "Activity",
    icon: "footprint",
    description: "Steps, calories, active minutes, distance.",
  },
  {
    to: "../sleep",
    label: "Sleep",
    icon: "bedtime",
    description: "Stages, efficiency, and timing.",
  },
  {
    to: "../heart-rate",
    label: "Heart Rate",
    icon: "favorite",
    description: "Resting HR plus zone breakdown.",
  },
  {
    to: "../hrv",
    label: "HRV",
    icon: "monitor_heart",
    description: "Daily and deep-sleep RMSSD.",
  },
  {
    to: "../weight",
    label: "Weight",
    icon: "scale",
    description: "Body mass over time.",
  },
  {
    to: "../exercises",
    label: "Exercises",
    icon: "exercise",
    description: "Logged workouts and intensities.",
  },
  {
    to: "../records",
    label: "Records",
    icon: "trophy",
    description: "All-time bests across metrics.",
  },
  {
    to: "../correlations",
    label: "Correlations",
    icon: "scatter_plot",
    description: "Cross-metric relationships and insights.",
  },
  {
    to: "../supplements",
    label: "Supplements",
    icon: "medication",
    description: "Adherence, ingredient rollups, lag correlations.",
  },
  {
    to: "../medications",
    label: "Medications",
    icon: "prescriptions",
    description: "Adherence and same-day correlations.",
  },
];

export function AnalyticsOverview() {
  const summary = useHealthSummary();
  const insights = useWeeklyInsights();
  const heatmap = useDayOfWeekHeatmap();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          {insights.data && <WeeklyInsights data={insights.data} />}
        </div>
        <div>{summary.data && <GoalRings summary={summary.data} />}</div>
      </div>

      {heatmap.data && <DayOfWeekHeatmap data={heatmap.data} />}

      <div>
        <h2 className="text-lg font-headline font-semibold text-on-surface mb-3">
          Jump to a metric
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {jumpCards.map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className="bg-surface-container rounded-xl p-4 border border-outline-variant/10 hover:border-primary/40 hover:bg-surface-container-high transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  {card.icon}
                </span>
                <span className="font-headline font-semibold text-sm text-on-surface group-hover:text-primary transition-colors">
                  {card.label}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant leading-snug">
                {card.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
