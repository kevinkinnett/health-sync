import type { Request, Response, NextFunction } from "express";
import type { ApiLogRepository } from "../repositories/apiLogRepo.js";
import { logger } from "../logger.js";

/**
 * Per-request logger for the v1 API surface.
 *
 * - Hooks `res.on("finish")` so the final status code and total
 *   duration are captured AFTER the response is sent.
 * - Insert is fire-and-forget — never awaits — so a slow DB never
 *   delays the response to the API consumer.
 * - Reads the optional `X-Caller` header for self-identification
 *   (the only "auth" we expose). Defaults to NULL.
 *
 * Mount this AFTER any auth middleware (when we add one) and BEFORE
 * the v1 router itself.
 */
export function apiLogger(repo: ApiLogRepository) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    res.on("finish", () => {
      const durationMs = Date.now() - start;
      const caller =
        (req.header("x-caller") || req.header("X-Caller") || null) as
          | string
          | null;
      const params =
        Object.keys(req.query).length > 0
          ? (req.query as Record<string, unknown>)
          : null;

      repo
        .log({
          caller,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
          requestParams: params,
        })
        .catch((err) => {
          logger.error({ err }, "Failed to write api_log entry");
        });
    });

    next();
  };
}
