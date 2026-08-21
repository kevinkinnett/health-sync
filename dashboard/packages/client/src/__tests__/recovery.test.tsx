import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { RecoveryActivity, RecoverySession } from "@health-dashboard/shared";
import { Recovery } from "../pages/Recovery";

const apiFetch = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const activities: RecoveryActivity[] = [
  { id: 1, code: "hot_blanket", name: "Hot blanket", category: "heat_therapy", defaultDurationMinutes: null, notes: null, isActive: true, createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z" },
  { id: 2, code: "massage", name: "Massage", category: "massage", defaultDurationMinutes: 60, notes: null, isActive: true, createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z" },
];

function renderPage(sessions: RecoverySession[] = []) {
  apiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (typeof path !== "string") return Promise.resolve([]);
    if (path === "/config") return Promise.resolve({ userTimezone: "America/New_York" });
    if (path.startsWith("/recovery/activities")) return Promise.resolve(activities);
    if (path.startsWith("/recovery/sessions") && !init?.method) return Promise.resolve(sessions);
    if (path === "/recovery/sessions" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      return Promise.resolve({ id: 99, activityCode: "hot_blanket", activityName: "Hot blanket", activityCategory: "heat_therapy", source: "manual", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), intensity: null, temperatureF: null, massageType: null, notes: null, ...body });
    }
    if (path.match(/^\/recovery\/sessions\/\d+$/) && init?.method === "PATCH") return Promise.resolve({ ...sessions[0], ...JSON.parse(String(init.body)) });
    return Promise.resolve(undefined);
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter><Recovery /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => apiFetch.mockReset());

describe("Recovery page", () => {
  it("shows activity-specific fields in the quick-log form", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /quick log hot blanket/i }));
    expect(screen.getByLabelText(/temperature/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/massage type/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: /quick log massage/i }));
    expect(screen.getByLabelText(/massage type/i)).toBeInTheDocument();
  });

  it("validates duration before sending a request", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /quick log hot blanket/i }));
    fireEvent.click(screen.getByRole("button", { name: /save session/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/duration must be/i);
    expect(apiFetch.mock.calls.some(([path, init]) => path === "/recovery/sessions" && init?.method === "POST")).toBe(false);
  });

  it("converts a backfilled Eastern local time to UTC", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /quick log hot blanket/i }));
    fireEvent.change(screen.getByLabelText("Started at"), { target: { value: "2026-08-18T21:30" } });
    fireEvent.change(screen.getByLabelText("Duration minutes"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: "130" } });
    fireEvent.click(screen.getByRole("button", { name: /save session/i }));
    await waitFor(() => {
      const call = apiFetch.mock.calls.find(([path, init]) => path === "/recovery/sessions" && init?.method === "POST");
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1].body))).toMatchObject({
        startedAt: "2026-08-19T01:30:00.000Z",
        durationMinutes: 45,
        temperatureF: 130,
      });
    });
  });

  it("displays local history and edits the existing session", async () => {
    const session: RecoverySession = {
      id: 7, activityId: 1, activityCode: "hot_blanket", activityName: "Hot blanket", activityCategory: "heat_therapy",
      startedAt: "2026-08-19T01:30:00Z", durationMinutes: 30, intensity: 3, temperatureF: 120,
      massageType: null, notes: null, source: "manual", createdAt: "2026-08-19T01:40:00Z", updatedAt: "2026-08-19T01:40:00Z",
    };
    renderPage([session]);
    expect(await screen.findByText(/Aug 18/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit hot blanket session/i }));
    const duration = screen.getByLabelText("Duration minutes") as HTMLInputElement;
    expect(duration.value).toBe("30");
    fireEvent.change(duration, { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: /save session/i }));
    await waitFor(() => expect(apiFetch.mock.calls.some(([path, init]) => path === "/recovery/sessions/7" && init?.method === "PATCH")).toBe(true));
  });

  it("requires confirmation before deleting a session", async () => {
    const session: RecoverySession = {
      id: 8, activityId: 2, activityCode: "massage", activityName: "Massage", activityCategory: "massage",
      startedAt: "2026-08-19T19:00:00Z", durationMinutes: 60, intensity: null, temperatureF: null,
      massageType: "Deep tissue", notes: null, source: "manual", createdAt: "2026-08-19T20:00:00Z", updatedAt: "2026-08-19T20:00:00Z",
    };
    renderPage([session]);
    fireEvent.click(await screen.findByRole("button", { name: /delete massage session/i }));
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(apiFetch.mock.calls.some(([path, init]) => path === "/recovery/sessions/8" && init?.method === "DELETE")).toBe(true));
  });
});
