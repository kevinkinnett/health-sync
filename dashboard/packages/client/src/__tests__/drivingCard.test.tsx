import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DrivingCard } from "../components/DrivingCard";
import type { DrivingSummary } from "@health-dashboard/shared";

const SUMMARY: DrivingSummary = {
  latestDate: "2026-05-29",
  latestMinutes: 45,
  weekMinutes: 210, // 3h 30m
  weekDrives: 14,
  trend: [
    { date: "2026-05-23", minutes: 20 },
    { date: "2026-05-24", minutes: 30 },
    { date: "2026-05-29", minutes: 45 },
  ],
};

describe("DrivingCard", () => {
  it("shows the weekly total, drive count, and most-recent day", () => {
    render(<DrivingCard data={SUMMARY} />);
    expect(screen.getByText("Time in Car")).toBeInTheDocument();
    expect(screen.getByText("3h 30m")).toBeInTheDocument();
    expect(screen.getByText(/14 drives/)).toBeInTheDocument();
    expect(screen.getByText(/May 29: 45m driving/)).toBeInTheDocument();
  });

  it("renders an empty state when there is no driving data", () => {
    render(
      <DrivingCard
        data={{ latestDate: null, latestMinutes: null, weekMinutes: 0, weekDrives: 0, trend: [] }}
      />,
    );
    expect(screen.getByText(/No driving data yet/)).toBeInTheDocument();
    expect(screen.queryByText("3h 30m")).not.toBeInTheDocument();
  });

  it("singularizes a single drive", () => {
    render(<DrivingCard data={{ ...SUMMARY, weekDrives: 1 }} />);
    expect(screen.getByText(/· 1 drive$/)).toBeInTheDocument();
  });
});
