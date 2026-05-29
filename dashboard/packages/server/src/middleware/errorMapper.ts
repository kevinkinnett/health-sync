import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../logger.js";
import {
  BadRequestError,
  NotFoundError,
  ValidationError,
} from "../services/errors.js";
import { AnalyticsNotFoundError } from "../services/analyticsService.js";
import {
  DossierFetchError,
  DossierNotFoundError,
} from "../services/dossierService.js";

/**
 * Express error-handling middleware. Mount as the LAST middleware in
 * `index.ts`, after all routes. Centralises the error-type → HTTP
 * status mapping that controllers used to duplicate in every method's
 * `handleError(err)` private helper.
 *
 * Mapping (all known service-layer errors funnel here):
 *
 *   - ZodError              → 400 { error, issues }
 *   - BadRequestError       → 400 { error }   (malformed params)
 *   - ValidationError       → 400 { error }   (business-rule violation)
 *   - NotFoundError         → 404 { error }
 *   - AnalyticsNotFoundError→ 404 { error }
 *   - DossierFetchError     → 502 { error }   (upstream LLM proxy)
 *   - everything else       → 500 { error }   (and logged)
 *
 * Production never returns 500 with a service error message — those
 * stay in the logs so internals don't leak. Known errors include
 * their own message because it's intended for the client (e.g.
 * "Item 42 not found").
 */
export const errorMapper: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request body", issues: err.issues });
    return;
  }
  if (err instanceof BadRequestError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof AnalyticsNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof DossierNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof DossierFetchError) {
    res.status(502).json({ error: err.message });
    return;
  }
  logger.error(
    {
      err,
      method: req.method,
      path: req.path,
    },
    "Unhandled controller error",
  );
  res.status(500).json({ error: "Internal server error" });
};
