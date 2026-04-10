import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Skip static file requests at info level
  if (!req.path.startsWith("/api/")) {
    return next();
  }

  const requestId = crypto.randomUUID();
  const start = Date.now();

  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const duration = Date.now() - start;
    const entry = {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
    };

    if (res.statusCode >= 500) {
      logger.error(entry, "request failed");
    } else if (res.statusCode >= 400) {
      logger.warn(entry, "request client error");
    } else {
      logger.info(entry, "request completed");
    }
  });

  next();
}
