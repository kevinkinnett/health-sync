export interface NavLinkDef {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  description?: string;
}

export interface NavSectionDef {
  header?: string;
  items: NavLinkDef[];
}

export const analyzeNavItems: NavLinkDef[] = [
  { to: "/analytics/overview", label: "Overview", icon: "insights", description: "A high-level view of movement, sleep, recovery, and body trends." },
  { to: "/analytics/activity", label: "Activity", icon: "footprint", description: "Daily movement, active minutes, distance, and energy expenditure." },
  { to: "/analytics/sleep", label: "Sleep", icon: "bedtime", description: "Sleep duration, stages, efficiency, and timing across each night." },
  { to: "/analytics/heart-rate", label: "Heart Rate", icon: "favorite", description: "Resting heart rate and time spent in training zones." },
  { to: "/analytics/hrv", label: "HRV", icon: "monitor_heart", description: "Heart-rate variability trends that can help explain recovery." },
  { to: "/analytics/vitals", label: "Vitals", icon: "vital_signs", description: "Respiratory rate, oxygen saturation, and temperature signals." },
  { to: "/analytics/eight-sleep", label: "Eight Sleep", icon: "bed", description: "Bed temperature, sleep sessions, and Eight Sleep performance." },
  { to: "/analytics/nutrition", label: "Nutrition", icon: "restaurant", description: "Calories and macronutrients recorded through your connected health data." },
  { to: "/analytics/weight", label: "Weight", icon: "scale", description: "Body-weight changes and longer-term direction." },
  { to: "/analytics/exercises", label: "Exercises", icon: "exercise", description: "Completed workouts, duration, distance, and training patterns." },
  { to: "/analytics/records", label: "Records", icon: "emoji_events", description: "Personal bests and standout values across your health history." },
  { to: "/analytics/correlations", label: "Correlations", icon: "scatter_plot", description: "Explore how two health signals move together over time." },
  { to: "/analytics/supplements", label: "Supplement Trends", icon: "medication", description: "Compare supplement timing with sleep, readiness, and recovery." },
  { to: "/analytics/medications", label: "Medication Trends", icon: "prescriptions", description: "Compare medication timing with sleep, readiness, and recovery." },
  { to: "/insights", label: "AI Insights", icon: "auto_awesome" },
];

const analyzeByPath = new Map(analyzeNavItems.map((item) => [item.to, item]));

function analyze(...paths: string[]): NavLinkDef[] {
  return paths.map((path) => {
    const item = analyzeByPath.get(path);
    if (!item) throw new Error(`Unknown analytics nav path: ${path}`);
    return item;
  });
}

export const navSections: NavSectionDef[] = [
  {
    items: [
      { to: "/", label: "Today", icon: "dashboard", end: true },
      { to: "/readiness", label: "Readiness", icon: "bolt" },
    ],
  },
  {
    header: "Explore",
    items: analyze("/analytics/overview"),
  },
  {
    header: "Changes",
    items: [
      { to: "/timeline", label: "Experiments", icon: "timeline" },
      ...analyze("/analytics/correlations", "/insights"),
    ],
  },
  {
    header: "Log",
    items: [
      { to: "/supplements", label: "Supplements", icon: "edit_note" },
      { to: "/medications", label: "Medications", icon: "edit_note" },
    ],
  },
  {
    header: "System",
    items: [
      { to: "/ingest", label: "Data Pipeline", icon: "settings_input_component" },
      { to: "/api-console", label: "API Console", icon: "api" },
      { to: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

export const allNavItems = navSections.flatMap((section) => section.items);

export const bottomNavQuickItems: NavLinkDef[] = [
  { to: "/", label: "Today", icon: "dashboard", end: true },
  { to: "/analytics/overview", label: "Trends", icon: "query_stats" },
  { to: "/timeline", label: "Changes", icon: "timeline" },
];
