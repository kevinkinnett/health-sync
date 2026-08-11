import { describe, expect, it } from "vitest";
import type { ChatTurn } from "@health-dashboard/shared";
import { buildOptimisticMessages } from "../components/insights/useInsightChat";
import {
  INSIGHT_JOB_STORAGE_KEY,
  readPersistedInsightJob,
} from "../components/insights/useInsightReports";

describe("Insights state rules", () => {
  it("recovers a valid persisted generation job", () => {
    const persisted = {
      jobId: "job-42",
      startedAt: "2026-08-11T16:00:00.000Z",
    };
    const storage = {
      getItem: (key: string) =>
        key === INSIGHT_JOB_STORAGE_KEY ? JSON.stringify(persisted) : null,
    };

    expect(readPersistedInsightJob(storage)).toEqual(persisted);
  });

  it.each([
    "not json",
    JSON.stringify({ jobId: "job-42" }),
    JSON.stringify({ jobId: 42, startedAt: "yesterday" }),
    JSON.stringify(null),
  ])("ignores corrupt persisted job state: %s", (raw) => {
    expect(readPersistedInsightJob({ getItem: () => raw })).toBeNull();
  });

  it("adds the pending user turn exactly once", () => {
    const messages: ChatTurn[] = [
      {
        role: "assistant",
        content: "What would you like to explore?",
        createdAt: "2026-08-11T16:00:00.000Z",
      },
    ];
    const pending = { isPending: true, message: "How is my sleep?" };

    expect(
      buildOptimisticMessages(
        messages,
        pending,
        () => "2026-08-11T16:01:00.000Z",
      ),
    ).toEqual([
      {
        role: "user",
        content: "How is my sleep?",
        createdAt: "2026-08-11T16:01:00.000Z",
      },
    ]);

    expect(
      buildOptimisticMessages(
        [...messages, { ...messages[0], role: "user", content: pending.message }],
        pending,
      ),
    ).toEqual([]);
  });
});
