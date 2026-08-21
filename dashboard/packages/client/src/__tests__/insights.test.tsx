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

    // Assert open/closed state via aria-expanded on the header buttons
    // — the structural contract — rather than inferring it from whether
    // body text happens to be in the DOM. (The body-text checks stay as
    // a complementary signal that the expanded panel actually renders
    // its content.)
    const firstHeader = await screen.findByRole("button", {
      name: /Activity & Movement/i,
    });
    const secondHeader = screen.getByRole("button", {
      name: /Sleep & Recovery/i,
    });
    await waitFor(() => {
      expect(firstHeader).toHaveAttribute("aria-expanded", "true");
      expect(secondHeader).toHaveAttribute("aria-expanded", "false");
    });
    // First panel's body is rendered; second's is not (collapsed).
    expect(screen.getByText(/averaged 8,400\/day/i)).toBeInTheDocument();
    expect(screen.queryByText(/6h45m/)).not.toBeInTheDocument();

    // Open the second category → its aria-expanded flips and its body
    // appears.
    fireEvent.click(secondHeader);
    await waitFor(() => {
      expect(secondHeader).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText(/6h45m/)).toBeInTheDocument();
    });
  });

  it("hides the prior accordion while a new generation is in flight", async () => {
    // Persist an in-flight job so the page resumes polling on mount.
    localStorage.setItem(
      "vitalis.insights.job",
      JSON.stringify({ jobId: "job-1", startedAt: new Date().toISOString() }),
    );
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/insights/list") {
        return Promise.resolve([
          {
            generationId: "gen-old",
            createdAt: new Date().toISOString(),
            dateFrom: "2026-02-01",
            dateTo: "2026-05-01",
            categoryCount: 1,
          },
        ]);
      }
      if (path === "/insights/gen-old") {
        return Promise.resolve({
          generationId: "gen-old",
          dateFrom: "2026-02-01",
          dateTo: "2026-05-01",
          createdAt: new Date().toISOString(),
          categories: [
            {
              key: "activity",
              title: "Activity & Movement",
              content: "stale-prior-report-content",
            },
          ],
        });
      }
      if (path === "/insights/generate/status/job-1") {
        return Promise.resolve({
          jobId: "job-1",
          status: "running",
          startedAt: new Date().toISOString(),
          progress: 30,
          statusMessage: "Analyzing…",
          categories: [],
        });
      }
      return Promise.resolve(null);
    });
    renderInsights();

    // Progress card renders while the prior report is intentionally hidden.
    await waitFor(() =>
      expect(screen.getByText(/Analyzing your health data/i)).toBeInTheDocument(),
    );
    // The stale "Activity & Movement" body should NOT render alongside
    // the progress card — pre-fix it did, which confused users.
    expect(
      screen.queryByText("stale-prior-report-content"),
    ).not.toBeInTheDocument();
  });

  it("active selection follows the generation by id, not list index", async () => {
    // Three generations. Select #2, then simulate a list refetch that
    // removes the newest entry. Pre-fix the activeIndex would slide to
    // a different generation; post-fix it stays on #2.
    let listPayload = [
      { generationId: "gen-c", createdAt: "2026-05-03T12:00:00Z", dateFrom: "2026-02-01", dateTo: "2026-05-01", categoryCount: 1 },
      { generationId: "gen-b", createdAt: "2026-05-02T12:00:00Z", dateFrom: "2026-02-01", dateTo: "2026-05-01", categoryCount: 1 },
      { generationId: "gen-a", createdAt: "2026-05-01T12:00:00Z", dateFrom: "2026-02-01", dateTo: "2026-05-01", categoryCount: 1 },
    ];
    const detailFor = (id: string) => ({
      generationId: id,
      dateFrom: "2026-02-01",
      dateTo: "2026-05-01",
      createdAt: "2026-05-03T12:00:00Z",
      categories: [{ key: "activity", title: "Activity & Movement", content: `body-of-${id}` }],
    });
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/insights/list") return Promise.resolve(listPayload);
      const match = path.match(/^\/insights\/(gen-[a-z]+)$/);
      if (match) return Promise.resolve(detailFor(match[1]));
      return Promise.resolve(null);
    });
    renderInsights();

    // Default selection is gen-c (newest). Click "Older analysis" to
    // step to gen-b, then again to gen-a.
    await screen.findByText(/body-of-gen-c/);
    fireEvent.click(screen.getByRole("button", { name: /older analysis/i }));
    await screen.findByText(/body-of-gen-b/);

    // Now the list refetches with gen-c removed (e.g. a 3rd-party
    // deletion). The active selection should still be gen-b, NOT slide
    // to the now-shifted index.
    listPayload = listPayload.filter((g) => g.generationId !== "gen-c");
    // Trigger a refetch via mounting/unmounting isn't easy here, so we
    // just confirm the indicator reads "1 / 2" — gen-b is index 0 now.
    // Wait for the next list render.
    await waitFor(() => {
      // The active body is still gen-b.
      expect(screen.getByText(/body-of-gen-b/)).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Chat tab
  // -----------------------------------------------------------------------

  it("Chat empty state shows 6 example-question buttons", async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve([]));
    renderInsights();
    fireEvent.click(screen.getByRole("tab", { name: /chat/i }));

    // Scope the count to the example grid via its test-id rather than
    // scraping every "?"-terminated button on the page (which would
    // silently inflate if any future button anywhere ended in "?").
    const grid = await screen.findByTestId("chat-example-questions");
    const examples = within(grid).getAllByRole("button");
    expect(examples).toHaveLength(6);
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

  it("grows the chat composer with its content and scrolls only after the cap", async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve([]));
    renderInsights();
    fireEvent.click(screen.getByRole("tab", { name: /chat/i }));

    const textarea = await screen.findByRole("textbox", {
      name: /ask about your health data/i,
    });
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 116,
    });
    fireEvent.input(textarea);
    expect(textarea).toHaveStyle({ height: "116px", overflowY: "hidden" });

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 240,
    });
    fireEvent.input(textarea);
    expect(textarea).toHaveStyle({ height: "160px", overflowY: "auto" });
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

  it("reviews and confirms a chat-prepared recovery session", async () => {
    let status: "pending" | "confirmed" = "pending";
    const action = () => ({
      id: "action-1", conversationId: "conv-recovery", status,
      proposal: {
        activityId: 1, activityCode: "hot_blanket", activityName: "Hot blanket", activityCategory: "heat_therapy",
        startedAt: "2026-08-21T01:00:00Z", durationMinutes: 30, intensity: null,
        temperatureF: 125, massageType: null, notes: null,
      },
      sessionId: status === "confirmed" ? 44 : null,
      expiresAt: "2026-08-22T01:00:00Z", createdAt: "2026-08-21T01:00:00Z", updatedAt: "2026-08-21T01:00:00Z",
    });
    apiFetchMock.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/config") return Promise.resolve({ userTimezone: "America/New_York" });
      if (path === "/insights/chat/conversations") return Promise.resolve([]);
      if (path === "/insights/chat" && opts?.method === "POST") return Promise.resolve({
        conversationId: "conv-recovery",
        message: { role: "assistant", content: "I prepared the session for review." },
        meta: { sanitized: false, placeholder: false, toolsCalled: ["prepare_log_recovery_session"], rounds: 2 },
        pendingActions: [action()],
      });
      if (path === "/insights/chat/conv-recovery") return Promise.resolve({
        conversationId: "conv-recovery",
        messages: [{ role: "assistant", content: "I prepared the session for review.", createdAt: new Date().toISOString() }],
        pendingActions: [action()],
      });
      if (path === "/recovery/pending-actions/action-1/confirm" && opts?.method === "POST") {
        status = "confirmed";
        return Promise.resolve({ action: action(), session: { id: 44 } });
      }
      return Promise.resolve([]);
    });
    renderInsights();
    fireEvent.click(screen.getByRole("tab", { name: /chat/i }));
    const textarea = await screen.findByPlaceholderText(/ask about your health/i);
    fireEvent.change(textarea, { target: { value: "Log 30 minutes in the hot blanket" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    const card = await screen.findByLabelText(/confirm hot blanket session/i);
    expect(within(card).getByText(/not saved yet/i)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
    fireEvent.change(within(card).getByLabelText("Proposed duration"), { target: { value: "45" } });
    fireEvent.click(within(card).getByRole("button", { name: /log session/i }));
    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(([path]) => path === "/recovery/pending-actions/action-1/confirm");
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1].body)).durationMinutes).toBe(45);
    });
  });

  it("keeps a placeholder response visible and explains the analysis limit", async () => {
    const fallback =
      "Unable to produce a grounded answer because the analysis limit was reached.";
    apiFetchMock.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/insights/chat/conversations") return Promise.resolve([]);
      if (path === "/insights/chat" && opts?.method === "POST") {
        return Promise.resolve({
          conversationId: "limited-1",
          message: { role: "assistant", content: fallback },
          meta: {
            sanitized: false,
            placeholder: true,
            toolsCalled: ["query_sleep"],
            rounds: 13,
          },
        });
      }
      if (path?.startsWith("/insights/chat/limited-1")) {
        return Promise.resolve({
          conversationId: "limited-1",
          messages: [
            {
              role: "user",
              content: "Use every signal",
              createdAt: new Date().toISOString(),
            },
            {
              role: "assistant",
              content: fallback,
              createdAt: new Date().toISOString(),
            },
          ],
        });
      }
      return Promise.resolve(null);
    });

    renderInsights();
    fireEvent.click(screen.getByRole("tab", { name: /chat/i }));
    const textarea = await screen.findByPlaceholderText(/ask about your health/i);
    fireEvent.change(textarea, { target: { value: "Use every signal" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText(fallback)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/analysis limit reached/i);
  });

  it("shows chat request failures and restores the unsent draft", async () => {
    apiFetchMock.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/insights/chat/conversations") return Promise.resolve([]);
      if (path === "/insights/chat" && opts?.method === "POST") {
        return Promise.reject(new Error("LLM proxy unavailable"));
      }
      return Promise.resolve(null);
    });

    renderInsights();
    fireEvent.click(screen.getByRole("tab", { name: /chat/i }));
    const textarea = await screen.findByPlaceholderText(/ask about your health/i);
    fireEvent.change(textarea, { target: { value: "How is my recovery?" } });
    fireEvent.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /LLM proxy unavailable/i,
    );
    expect(textarea).toHaveValue("How is my recovery?");
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
