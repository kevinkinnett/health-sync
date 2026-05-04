import { Router } from "express";
import type { ApiLogRepository } from "../repositories/apiLogRepo.js";
import { logger } from "../logger.js";

/**
 * Admin route — exposes the API log to the dashboard's API Console UI.
 * Mounted at `/api/admin/api-logs` under the existing internal API
 * surface (NOT `/api/v1`), so that dashboard-driven introspection
 * doesn't itself pollute the v1 usage stats.
 */
export function createApiLogRoutes(repo: ApiLogRepository): Router {
  const router = Router();

  router.get("/stats", async (req, res) => {
    try {
      const windowHours = Math.max(
        1,
        Math.min(7 * 24, parseInt(String(req.query.windowHours ?? "24"), 10) || 24),
      );
      const stats = await repo.getStats(windowHours);
      res.json(stats);
    } catch (err) {
      logger.error({ err }, "Failed to read api log stats");
      res.status(500).json({ error: "Failed to read api log stats" });
    }
  });

  router.get("/recent", async (req, res) => {
    try {
      const limit = Math.max(
        1,
        Math.min(500, parseInt(String(req.query.limit ?? "50"), 10) || 50),
      );
      const caller = typeof req.query.caller === "string" ? req.query.caller : undefined;
      const rows = await repo.getRecent({ limit, caller });
      res.json(rows);
    } catch (err) {
      logger.error({ err }, "Failed to read recent api log");
      res.status(500).json({ error: "Failed to read recent api log" });
    }
  });

  return router;
}
