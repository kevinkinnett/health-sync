import { describe, expect, it } from "vitest";
import { readinessSourceContribution, readinessSourceLabel } from "../lib/readinessSource";

describe("readiness source provenance", () => {
  it("separates a Fitbit device from the Google Health provider", () => {
    const source = {
      provenance: {
        device: "fitbit" as const,
        deviceLabel: "Fitbit device",
        provider: "google_health" as const,
        providerLabel: "Google Health",
      },
      z: 0.9,
    };

    expect(readinessSourceLabel(source)).toBe("Fitbit device via Google Health");
    expect(readinessSourceContribution(source)).toBe("Fitbit device via Google Health +0.9");
  });

  it("does not repeat a first-party device/provider name", () => {
    expect(
      readinessSourceLabel({
        provenance: {
          device: "eight_sleep",
          deviceLabel: "Eight Sleep",
          provider: "eight_sleep",
          providerLabel: "Eight Sleep",
        },
        z: -0.2,
      }),
    ).toBe("Eight Sleep");
  });
});
