import { Router, type Request, type Response } from "express";

/**
 * Public read-only config endpoint. The client fetches this once on app
 * load to learn the user's IANA timezone, which it then uses for
 * everything date-range and bucketing.
 *
 * Kept deliberately tiny — anything that needs a write surface (settings
 * UI, multi-user) belongs in a real settings/persistence layer, not here.
 */
export function createConfigRoutes(opts: { userTimezone: string }): Router {
  const router = Router();

  router.get("/", (_req: Request, res: Response) => {
    res.json({ userTimezone: opts.userTimezone });
  });

  return router;
}
