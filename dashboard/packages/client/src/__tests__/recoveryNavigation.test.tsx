import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Recovery } from "../pages/Recovery";

vi.mock("../api/queries", () => {
  const query = { data: [], isLoading: false, isError: false };
  const mutation = { mutateAsync: vi.fn(), isPending: false };
  return {
    useArchiveRecoveryActivity: () => mutation,
    useCreateRecoveryActivity: () => mutation,
    useCreateRecoverySession: () => mutation,
    useDeleteRecoverySession: () => mutation,
    useRecoveryActivities: () => query,
    useRecoverySessions: () => query,
    useUpdateRecoveryActivity: () => mutation,
    useUpdateRecoverySession: () => mutation,
    useUserTimezone: () => "America/New_York",
  };
});

describe("Recovery analysis navigation", () => {
  it("links directly to the anchored Relationships recovery report", () => {
    render(<MemoryRouter><Recovery /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /view effects/i })).toHaveAttribute(
      "href",
      "/analytics/correlations#recovery-effects",
    );
  });
});
