import { describe, expect, it } from "vitest";
import { IngestRepository } from "../repositories/ingestRepo.js";

function fakePool(rows: Record<string, unknown>[], sqlCalls: string[]) {
  return {
    query: async (sql: string) => {
      sqlCalls.push(sql);
      return { rows };
    },
  } as never;
}

describe("IngestRepository Google Health cutover", () => {
  it("derives coverage from Google Health raw points and the latest run", async () => {
    const sqlCalls: string[] = [];
    const repo = new IngestRepository(
      fakePool(
        [
          {
            data_type: "activity",
            earliest_fetched_date: "2025-01-01",
            latest_fetched_date: "2026-08-09",
            history_target_met: true,
            last_success_at_utc: new Date("2026-08-09T21:12:00Z"),
            last_run_id: "5001",
            updated_at_utc: new Date("2026-08-09T21:11:30Z"),
          },
        ],
        sqlCalls,
      ),
    );

    await expect(repo.getState()).resolves.toEqual([
      {
        dataType: "activity",
        earliestFetchedDate: "2025-01-01",
        latestFetchedDate: "2026-08-09",
        historyTargetMet: true,
        lastSuccessAtUtc: "2026-08-09T21:12:00.000Z",
        lastRunId: 5001,
        updatedAtUtc: "2026-08-09T21:11:30.000Z",
      },
    ]);
    expect(sqlCalls[0]).toContain("universe.google_health_data_point");
    expect(sqlCalls[0]).toContain("provider = 'google_health'");
    expect(sqlCalls[0]).not.toContain("fitbit_ingest_state");
    expect(sqlCalls[0]).not.toContain("'vo2_max'");
  });

  it("returns only Google Health audit runs and normalizes their details", async () => {
    const sqlCalls: string[] = [];
    const repo = new IngestRepository(
      fakePool(
        [
          {
            ingest_run_id: "5002",
            started_at_utc: new Date("2026-08-09T21:11:00Z"),
            finished_at_utc: new Date("2026-08-09T21:12:00Z"),
            status: "completed",
            rows_written: "1234",
            error_count: "1",
            details: {
              captured: {
                steps: { points: 1200 },
                "oxygen-saturation": { error: "rate limited" },
              },
              rolled: { sleep_days: 7, since: "2026-06-25" },
            },
          },
        ],
        sqlCalls,
      ),
    );

    const [run] = await repo.getRuns(20);

    expect(sqlCalls[0]).toContain("provider = 'google_health'");
    expect(sqlCalls[0]).not.toContain("provider = 'fitbit'");
    expect(run).toMatchObject({
      ingestRunId: 5002,
      rowsWritten: 1234,
      errorCount: 1,
      details: {
        steps: { rows: 1200, errors: 0, range: "" },
        oxygen_saturation: { rows: 0, errors: 1, range: "" },
        rollup_sleep_days: { rows: 7, errors: 0, range: "" },
      },
    });
  });

  it("guards manual triggers with Google Health running jobs", async () => {
    const sqlCalls: string[] = [];
    const repo = new IngestRepository(fakePool([{ exists: 1 }], sqlCalls));

    await expect(repo.hasRunningJob()).resolves.toBe(true);
    expect(sqlCalls[0]).toContain("provider = 'google_health'");
    expect(sqlCalls[0]).toContain("started_at_utc >= NOW() - INTERVAL '2 hours'");
    expect(sqlCalls[0]).not.toContain("provider = 'fitbit'");
  });
});
