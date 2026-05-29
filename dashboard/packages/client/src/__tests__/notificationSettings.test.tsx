import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationSettingsCard } from "../components/NotificationSettingsCard";
import type { NotificationSettings } from "@health-dashboard/shared";

const apiFetchMock = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (path: string, opts?: RequestInit) => apiFetchMock(path, opts),
}));

const DEFAULTS: NotificationSettings = {
  pushEnabled: true,
  pushSeverities: ["alert", "warn"],
  kinds: { illnessTriad: true, lowSpo2: true, readinessDrop: true },
  thresholds: {
    illnessSigma: 1.5,
    spo2AlertBelow: 90,
    spo2WarnBelow: 92,
    readinessDropPoints: 18,
    cooldownDays: 3,
  },
  weeklyReportEnabled: true,
  appriseUrl: "https://apprise.tail322ce1.ts.net/notify/health",
};

function renderCard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationSettingsCard />
    </QueryClientProvider>,
  );
}

describe("NotificationSettingsCard", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("loads current settings; Save is disabled until something changes", async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve(DEFAULTS));
    renderCard();

    const toggle = await screen.findByTestId("notif-push-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("notif-save")).toBeDisabled();
  });

  it("enables Save after an edit and PUTs the updated settings", async () => {
    apiFetchMock.mockImplementation((_path: string, opts?: RequestInit) => {
      if (opts?.method === "PUT") {
        return Promise.resolve(JSON.parse(String(opts.body)));
      }
      return Promise.resolve(DEFAULTS);
    });
    renderCard();

    const toggle = await screen.findByTestId("notif-push-toggle");
    fireEvent.click(toggle); // turn push OFF
    expect(toggle).toHaveAttribute("aria-checked", "false");

    const save = screen.getByTestId("notif-save");
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/settings/notifications",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const putCall = apiFetchMock.mock.calls.find((c) => c[1]?.method === "PUT");
    expect(JSON.parse(String(putCall?.[1].body)).pushEnabled).toBe(false);

    // After save, the cache reflects the saved value → Save disables again.
    await waitFor(() => expect(save).toBeDisabled());
  });

  it("surfaces the Apprise status when sending a test (204 = no targets)", async () => {
    apiFetchMock.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/settings/notifications/test" && opts?.method === "POST") {
        return Promise.resolve({ delivered: false, status: 204 });
      }
      return Promise.resolve(DEFAULTS);
    });
    renderCard();

    fireEvent.click(await screen.findByTestId("notif-test"));
    const result = await screen.findByTestId("notif-test-result");
    expect(result).toHaveTextContent(/no targets/i);
  });

  it("reports a delivered test push", async () => {
    apiFetchMock.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/settings/notifications/test" && opts?.method === "POST") {
        return Promise.resolve({ delivered: true, status: 200 });
      }
      return Promise.resolve(DEFAULTS);
    });
    renderCard();

    fireEvent.click(await screen.findByTestId("notif-test"));
    expect(await screen.findByTestId("notif-test-result")).toHaveTextContent(
      /delivered/i,
    );
  });
});
