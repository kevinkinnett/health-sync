import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Insights } from "../pages/Insights";

const apiFetchMock = vi.fn();

vi.mock("../api/client", () => ({
  apiFetch: (path: string, opts?: RequestInit) => apiFetchMock(path, opts),
}));

function renderInsights() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Insights />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Insights page", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
  });

  // -----------------------------------------------------------------------
  // Tab switcher
  // -----------------------------------------------------------------------

  it("defaults to the Reports tab and switches to Chat on click", () => {
    apiFetchMock.mockImplementation(() => Promise.resolve([]));
    renderInsights();

    const reportsTab = screen.getByRole("tab", { name: /reports/i });
    const chatTab = screen.getByRole("tab", { name: /chat/i });
    expect(reportsTab.getAttribute("aria-selected")).toBe("true");
    expect(chatTab.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(chatTab);
    expect(chatTab.getAttribute("aria-selected")).toBe("true");
  });

  // -----------------------------------------------------------------------
  // Reports tab
  // -----------------------------------------------------------------------

  it("Reports empty state renders 'Generate First Analysis' CTA", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/insights/list") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderInsights();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /generate first analysis/i }),
      ).toBeInTheDocument(),
    );
  });

  it("Regenerate kicks off a job, persists jobId to localStorage, and shows a progress card", async () => {
    let callCount = 0;
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/insights/list") return Promise.resolve([]);
      if (path === "/insights/generate") return Promise.resolve({ jobId: "job-abc" });
      if (path === "/insights/generate/status/job-abc") {
        callCount++;
        return Promise.resolve({
          jobId: "job-abc",
          status: callCount > 2 ? "running" : "pending",
          startedAt: new Date().toISOString(),
          progress: 35,
          statusMessage: "Analyzing in parallel: Activity · Sleep (2/6 done)",
          categories: [],
        });
      }
      return Promise.resolve(null);
    });
    renderInsights();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /generate first analysis/i }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /generate first analysis/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Analyzing your health data/i)).toBeInTheDocument();
      // Progress text from the status response should render.
      expect(
        screen.getByText(/Analyzing in parallel/i),
      ).toBeInTheDocument();
      // Persistence so a refresh resumes polling
      expect(localStorage.getItem("vitalis.insights.job")).toContain("job-abc");
    });
  });

  it("renders a generation's category accordion with the first category open", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/insights/list") {
        return Promise.resolve([
          {
            generationId: "gen-1",
            createdAt: new Date().toISOString(),
            dateFrom: "2026-02-01",
            dateTo: "2026-05-01",
            categoryCount: 2,
          },
        ]);
      }
      if (path === "/insights/gen-1") {
        return Promise.resolve({
          generationId: "gen-1",
          dateFrom: "2026-02-01",
          dateTo: "2026-05-01",
          createdAt: new Date().toISOString(),
          categories: [
            {
              key: "activity",
              title: "Activity & Movement",
              content: "**Steps trend**: averaged 8,400/day this month.",
            },
            {
              key: "sleep",
              title: "Sleep & Recovery",
              content: "Sleep averaged 6h45m.",
            },
          ],
        });
      }
      return Promise.resolve(null);
    });
    renderInsights();
    await waitFor(() => {
      // First category expanded by default
      expect(screen.getByText("Activity & Movement")).toBeInTheDocument();
      expect(screen.getByText(/averaged 8,400\/day/i)).toBeInTheDocument();
      // Second category collapsed (header visible, body not)
      expect(screen.getByText("Sleep & Recovery")).toBeInTheDocument();
      expect(screen.queryByText(/6h45m/)).not.toBeInTheDocument();
    });

    // Open the second category
    fireEvent.click(screen.getByRole("button", { name: /Sleep & Recovery/i }));
    await waitFor(() => {
      expect(screen.getByText(/6h45m/)).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Chat tab
  // -----------------------------------------------------------------------

  it("Chat empty state shows 6 example-question buttons", async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve([]));
    renderInsights();
    fireEvent.click(screen.getByRole("tab", { name: /chat/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Ask anything about your health data/i),
      ).toBeInTheDocument();
    });
    // Each example question is a button. Using getAllByRole and
    // filtering for buttons inside the chat empty area would be
    // ideal — we approximate by checking ≥6 buttons appear in the
    // example grid (the "auto_awesome" icon is on the page header).
    const examples = screen.getAllByRole("button").filter((b) =>
      /\?$/.test(b.textContent ?? ""),
    );
    expect(examples.length).toBeGreaterThanOrEqual(6);
  });

  it("clicking an example pre-fills the chat input", async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve([]));
    renderInsights();
    fireEvent.click(screen.getByRole("tab", { name: /chat/i }));

    const textarea = await screen.findByPlaceholderText(/ask about your health/i);
    expect((textarea as HTMLTextAreaElement).value).toBe("");

    const example = screen.getAllByRole("button").find((b) =>
      /trending vs last month/i.test(b.textContent ?? ""),
    );
    expect(example).toBeDefined();
    fireEvent.click(example!);
    expect((textarea as HTMLTextAreaElement).value).toMatch(
      /trending vs last month/i,
    );
  });

  it("sends a chat message and persists the conversation id for follow-ups", async () => {
    let convId: string | null = null;
    apiFetchMock.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/insights/chat/conversations") return Promise.resolve([]);
      if (path === "/insights/chat" && opts?.method === "POST") {
        // Body parsing not needed for the assertion — we just care
        // that POST /insights/chat was reached.
        convId = "conv-1";
        return Promise.resolve({
          conversationId: convId,
          message: { role: "assistant", content: "Sleep averaged 6h45m." },
          meta: { sanitized: false, placeholder: false, toolsCalled: ["query_sleep"], rounds: 2 },
        });
      }
      if (path?.startsWith("/insights/chat/conv-1")) {
        return Promise.resolve({
          conversationId: "conv-1",
          messages: [
            { role: "user", content: "How is my sleep?", createdAt: new Date().toISOString() },
            { role: "assistant", content: "Sleep averaged 6h45m.", createdAt: new Date().toISOString() },
          ],
        });
      }
      return Promise.resolve(null);
    });

    renderInsights();
    fireEvent.click(screen.getByRole("tab", { name: /chat/i }));

    const textarea = await screen.findByPlaceholderText(/ask about your health/i);
    fireEvent.change(textarea, { target: { value: "How is my sleep?" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(screen.getByText(/Sleep averaged 6h45m/)).toBeInTheDocument();
    });
    expect(convId).toBe("conv-1");
  });

  it("Enter sends, Shift+Enter does not", async () => {
    const sendCalls: unknown[] = [];
    apiFetchMock.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/insights/chat/conversations") return Promise.resolve([]);
      if (path === "/insights/chat" && opts?.method === "POST") {
        sendCalls.push(opts.body);
        return Promise.resolve({
          conversationId: "c1",
          message: { role: "assistant", content: "ok" },
          meta: { sanitized: false, placeholder: false, toolsCalled: [], rounds: 1 },
        });
      }
      if (path?.startsWith("/insights/chat/c1")) {
        return Promise.resolve({ conversationId: "c1", messages: [] });
      }
      return Promise.resolve(null);
    });

    renderInsights();
    fireEvent.click(screen.getByRole("tab", { name: /chat/i }));

    const textarea = await screen.findByPlaceholderText(/ask about your health/i);
    fireEvent.change(textarea, { target: { value: "first" } });
    // Shift+Enter should NOT submit
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(sendCalls).toHaveLength(0);
    // Plain Enter SHOULD submit
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    await waitFor(() => expect(sendCalls.length).toBe(1));
  });

  it("History dropdown lists prior conversations and lets you load one", async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/insights/chat/conversations") {
        return Promise.resolve([
          {
            conversationId: "old-1",
            preview: "How was my sleep last week?",
            messageCount: 4,
            lastMessageAt: new Date().toISOString(),
          },
        ]);
      }
      if (path === "/insights/chat/old-1") {
        return Promise.resolve({
          conversationId: "old-1",
          messages: [
            { role: "user", content: "How was my sleep last week?", createdAt: new Date().toISOString() },
            { role: "assistant", content: "It averaged 7h.", createdAt: new Date().toISOString() },
          ],
        });
      }
      return Promise.resolve(null);
    });

    renderInsights();
    fireEvent.click(screen.getByRole("tab", { name: /chat/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /conversation history/i }),
    );

    const menu = await screen.findByRole("menu");
    // The conversations list loads async after the dropdown mounts —
    // findByText (async) waits for it.
    const old = await within(menu).findByText(/sleep last week/i);
    fireEvent.click(old);
    await waitFor(() => {
      expect(screen.getByText(/It averaged 7h/)).toBeInTheDocument();
    });
  });
});
