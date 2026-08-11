import { describe, expect, it } from "vitest";
import { alertAction } from "../lib/alertActions";

describe("alert actions", () => {
  it("routes ingestion incidents to pipeline recovery", () => {
    expect(alertAction("ingest_stale")).toMatchObject({
      category: "pipeline",
      to: "/ingest",
      label: "Open data pipeline",
    });
  });

  it("routes biometric alerts to the relevant health view", () => {
    expect(alertAction("low_spo2")).toMatchObject({
      category: "health",
      to: "/analytics/vitals",
    });
    expect(alertAction("readiness_drop").to).toBe("/readiness");
  });
});
