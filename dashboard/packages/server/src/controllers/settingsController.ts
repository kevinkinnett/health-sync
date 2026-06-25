import type { Request, Response } from "express";
import type { SettingService } from "../services/settingService.js";

/**
 * HTTP surface for user settings. Handlers throw on failure and let
 * `errorMapper` translate — a malformed PUT body surfaces as a ZodError
 * → 400 without any try/catch here.
 */
export class SettingsController {
  constructor(private service: SettingService) {}

  async getNotifications(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.getNotificationSettings());
  }

  async updateNotifications(req: Request, res: Response): Promise<void> {
    res.json(await this.service.updateNotificationSettings(req.body));
  }

  async testNotification(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.sendTestNotification());
  }

  async getLlmModels(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.getLlmModelSettings());
  }

  async updateLlmModels(req: Request, res: Response): Promise<void> {
    res.json(await this.service.updateLlmModelSettings(req.body));
  }
}
