import { Router } from "express";
import { logger } from "../../logger.js";
import { buildV1Endpoints, type V1Context } from "./endpoints.js";

/**
 * Bind every v1 endpoint def to a GET route. The wrapper is the only
 * code path callers can take: it parses query args, runs the handler,
 * and shapes the response as `{ data, timestamp }`. Errors are logged
 * with the path and returned as `{ error, message }` with status 500
 * (or 400 for argument-shape problems thrown by the handler).
 */
export function createV1Router(ctx: V1Context): Router {
  const router = Router();

  for (const ep of buildV1Endpoints()) {
    router.get(ep.path, async (req, res) => {
      try {
        const result = await ep.handler(
          req.query as Record<string, unknown>,
          ctx,
        );
        res.json({ data: result, timestamp: new Date().toISOString() });
      } catch (err) {
        const message = (err as Error).message ?? "Query failed";
        // Surface argument-shape problems as 400 so callers can correct
        // them; everything else is a 500.
        const isClientError = /required|invalid|missing/i.test(message);
        const status = isClientError ? 400 : 500;
        logger.error(
          { err, path: ep.path, status },
          "v1 API error",
        );
        res.status(status).json({
          error: isClientError ? "Bad request" : "Query failed",
          message,
        });
      }
    });
  }

  return router;
}
