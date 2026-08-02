import { Router } from "express";
import { SERVER_BUILD } from "../buildInfo.js";

/**
 * `GET /api/version` — what this API is running.
 *
 * Mounted outside the versioned `/api/v1` surface on purpose: it answers
 * "which build is this?", which must stay reachable at a fixed URL across
 * every future API version, and it is the first thing you want to curl
 * when a deploy looks like it did not take.
 *
 * Explicitly not cached. The service worker treats `/api/*` as
 * NetworkFirst with a 5-minute expiry, and a cached answer here would
 * report a version that is no longer running — the exact failure this
 * endpoint exists to rule out.
 */
export function createVersionRoutes(): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(SERVER_BUILD);
  });
  return router;
}
