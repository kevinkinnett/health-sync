import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LlmModelSettingsCard } from "../components/LlmModelSettingsCard";

const apiFetch = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function renderCard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <LlmModelSettingsCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => apiFetch.mockReset());

describe("LlmModelSettingsCard", () => {
  it("loads the current per-task models into the selects", async () => {
    apiFetch.mockResolvedValue({ dossier: "haiku", insights: "opus", chat: "sonnet" });
    renderCard();
    const insights = (await screen.findByLabelText(
      /Model for Weekly Insights/i,
    )) as HTMLSelectElement;
    expect(insights.value).toBe("opus");
    expect((screen.getByLabelText(/Model for Chat/i) as HTMLSelectElement).value).toBe("sonnet");
    expect(
      (screen.getByLabelText(/Model for Supplement/i) as HTMLSelectElement).value,
    ).toBe("haiku");
  });

  it("Save is disabled until a selection changes, then PUTs the full set", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/settings/llm-models" && init?.method === "PUT") {
        return Promise.resolve(JSON.parse(init.body as string));
      }
      return Promise.resolve({ dossier: "sonnet", insights: "sonnet", chat: "sonnet" });
    });
    renderCard();

    const insights = (await screen.findByLabelText(
      /Model for Weekly Insights/i,
    )) as HTMLSelectElement;
    const save = screen.getByRole("button", { name: /save/i });
    expect(save).toBeDisabled();

    fireEvent.change(insights, { target: { value: "opus" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => {
      const put = apiFetch.mock.calls.find(
        ([p, init]) => p === "/settings/llm-models" && init?.method === "PUT",
      );
      expect(put).toBeDefined();
      expect(JSON.parse(put![1].body)).toEqual({
        dossier: "sonnet",
        insights: "opus",
        chat: "sonnet",
      });
    });
  });

  it("keeps a stored full claude-* id selectable as a custom option", async () => {
    apiFetch.mockResolvedValue({
      dossier: "claude-sonnet-4-6",
      insights: "sonnet",
      chat: "sonnet",
    });
    renderCard();
    const dossier = (await screen.findByLabelText(
      /Model for Supplement/i,
    )) as HTMLSelectElement;
    expect(dossier.value).toBe("claude-sonnet-4-6");
  });

  it("keeps a stored custom id reachable after switching that dropdown away", async () => {
    apiFetch.mockResolvedValue({
      dossier: "claude-sonnet-4-6",
      insights: "sonnet",
      chat: "sonnet",
    });
    renderCard();
    const dossier = (await screen.findByLabelText(
      /Model for Supplement/i,
    )) as HTMLSelectElement;
    fireEvent.change(dossier, { target: { value: "opus" } });
    expect(dossier.value).toBe("opus");
    // The custom id must remain selectable so the switch isn't a one-way door.
    expect([...dossier.options].map((o) => o.value)).toContain(
      "claude-sonnet-4-6",
    );
  });
});
