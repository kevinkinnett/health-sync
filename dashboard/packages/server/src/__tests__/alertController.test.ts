import { describe, expect, it, vi } from "vitest";
import { AlertController } from "../controllers/alertController.js";

describe("AlertController", () => {
  it("honors and bounds the alert history limit", async () => {
    const list = vi.fn().mockResolvedValue({ alerts: [], unreadCount: 0 });
    const controller = new AlertController({ list } as never);
    const json = vi.fn();

    await controller.list({ query: { limit: "10" } } as never, { json } as never);
    expect(list).toHaveBeenCalledWith(10);

    await controller.list({ query: { limit: "999" } } as never, { json } as never);
    expect(list).toHaveBeenLastCalledWith(200);
  });

  it("uses the default for an invalid limit", async () => {
    const list = vi.fn().mockResolvedValue({ alerts: [], unreadCount: 0 });
    const controller = new AlertController({ list } as never);

    await controller.list(
      { query: { limit: "invalid" } } as never,
      { json: vi.fn() } as never,
    );
    expect(list).toHaveBeenCalledWith(50);
  });

  it("acknowledges one alert and rejects invalid ids", async () => {
    const markRead = vi.fn().mockResolvedValue(true);
    const controller = new AlertController({ markRead } as never);
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();

    await controller.markRead(
      { params: { id: "14" } } as never,
      { status, json } as never,
    );
    expect(markRead).toHaveBeenCalledWith(14);
    expect(status).toHaveBeenCalledWith(200);

    await controller.markRead(
      { params: { id: "nope" } } as never,
      { status, json } as never,
    );
    expect(status).toHaveBeenLastCalledWith(400);
  });
});
