import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  appriseUrl: "https://apprise.tail322ce1.ts.net/notify/apprise?tag=health",
};

function renderCard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const rendered = render(
    <QueryClientProvider client={qc}>
      <NotificationSettingsCard />
    </QueryClientProvider>,
  );
  return { ...rendered, queryClient: qc };
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

  it("shows a load failure instead of leaving the card in its loading state", async () => {
    apiFetchMock.mockRejectedValueOnce(new Error("settings offline"));
    renderCard();

    expect(
      await screen.findByText("Could not load notification settings."),
    ).toBeInTheDocument();
    expect(screen.getByText("settings offline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("preserves unsaved edits when canonical data refreshes in the background", async () => {
    apiFetchMock.mockResolvedValue(DEFAULTS);
    const { queryClient } = renderCard();

    const push = await screen.findByTestId("notif-push-toggle");
    fireEvent.click(push);
    expect(push).toHaveAttribute("aria-checked", "false");

    act(() => {
      queryClient.setQueryData(["settings", "notifications"], {
        ...DEFAULTS,
        weeklyReportEnabled: false,
      });
    });

    expect(push).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("notif-weekly-toggle")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("notif-save")).toBeEnabled();
  });

  it("semantically disables severity controls when phone delivery is off", async () => {
    apiFetchMock.mockResolvedValue(DEFAULTS);
    renderCard();

    fireEvent.click(await screen.findByTestId("notif-push-toggle"));
    const warnings = screen.getByTestId("notif-sev-warn");
    expect(warnings).toBeDisabled();
    expect(warnings).toHaveAttribute("aria-pressed", "true");
  });

  it("validates the endpoint and blocks both Save and Send test for a dirty URL", async () => {
    apiFetchMock.mockResolvedValue(DEFAULTS);
    renderCard();

    fireEvent.change(await screen.findByLabelText("Apprise endpoint"), {
      target: { value: "not-a-url" },
    });

    expect(screen.getByText("Enter a complete Apprise URL.")).toBeInTheDocument();
    expect(screen.getByTestId("notif-save")).toBeDisabled();
    expect(screen.getByTestId("notif-test")).toBeDisabled();
  });

  it("surfaces save and delivery-test request failures", async () => {
    apiFetchMock.mockImplementation((path: string, opts?: RequestInit) => {
      if (opts?.method === "PUT") return Promise.reject(new Error("save offline"));
      if (path === "/settings/notifications/test") {
        return Promise.reject(new Error("test offline"));
      }
      return Promise.resolve(DEFAULTS);
    });
    renderCard();

    fireEvent.click(await screen.findByTestId("notif-test"));
    expect(await screen.findByText(/Test failed: test offline/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("notif-weekly-toggle"));
    fireEvent.click(screen.getByTestId("notif-save"));
    expect(await screen.findByText(/Save failed: save offline/)).toBeInTheDocument();
  });
});
