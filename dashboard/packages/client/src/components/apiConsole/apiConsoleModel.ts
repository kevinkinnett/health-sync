export interface CurlExample {
  title: string;
  description: string;
  command: string;
}

export type StatusTone = "good" | "warn" | "bad";

export function apiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/v1`;
}

export function buildCurlExamples(base: string): CurlExample[] {
  return [
    {
      title: "Latest health snapshot",
      description: "Latest values and 30-day sparklines for every metric.",
      command: `curl ${base}/summary`,
    },
    {
      title: "Activity over the last month",
      description: "Daily steps, distance, calories, and active minutes.",
      command: `curl "${base}/activity?start=2026-04-04&end=2026-05-04"`,
    },
    {
      title: "Personal records and current streaks",
      description: "All-time bests and active streaks.",
      command: `curl ${base}/records`,
    },
    {
      title: "Supplement → health correlations",
      description: "Intake-to-metric correlation with an optional day lag.",
      command: `curl "${base}/supplements/correlations?itemId=7&lag=1"`,
    },
    {
      title: "Identify your script (recommended)",
      description: "Tag requests so they are identifiable in recent activity.",
      command: `curl -H "X-Caller: my-script" ${base}/summary`,
    },
  ];
}

export function errorRateTone(errorRate: number): StatusTone {
  if (errorRate > 0.05) return "bad";
  if (errorRate > 0) return "warn";
  return "good";
}

export function responseStatusTone(statusCode: number): StatusTone {
  if (statusCode >= 500) return "bad";
  if (statusCode >= 400) return "warn";
  return "good";
}
