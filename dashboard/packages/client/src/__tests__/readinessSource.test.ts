import { describe, expect, it } from "vitest";
import { readinessSourceContribution, readinessSourceLabel } from "../lib/readinessSource";

describe("readiness source provenance", () => {
  it("separates a Fitbit device from the Google Health provider", () => {
    const source = {
      label: "Fitbit",
      provenance: {
        device: "fitbit" as const,
        deviceLabel: "Fitbit device",
        provider: "google_health" as const,
        providerLabel: "Google Health",
      },
      z: 0.9,
      value: 48,
      baseline: 45,
      measurement: "daily RMSSD",
      regime: "daily_hrv_v1",
    };

    expect(readinessSourceLabel(source)).toBe("Fitbit device via Google Health");
    expect(readinessSourceContribution(source)).toBe("Fitbit device via Google Health +0.9");
  });

  it("does not repeat a first-party device/provider name", () => {
    expect(
      readinessSourceLabel({
        label: "Eight Sleep",
        provenance: {
          device: "eight_sleep",
          deviceLabel: "Eight Sleep",
          provider: "eight_sleep",
          providerLabel: "Eight Sleep",
        },
        z: -0.2,
        value: 44,
        baseline: 46,
        measurement: "main-session RMSSD",
        regime: "main_session_v1",
      }),
    ).toBe("Eight Sleep");
  });

  it("accepts a legacy response while client and server builds overlap", () => {
    expect(
      readinessSourceLabel({ label: "Fitbit", z: 0.4 } as never),
    ).toBe("Fitbit");
  });
});
