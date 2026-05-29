import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an `async (req, res) => …` route so any thrown error is
 * forwarded to Express's next-error chain — where `errorMapper`
 * translates it into an HTTP status and JSON body.
 *
 * Without this, an unhandled rejection inside an async handler stalls
 * the response and triggers a Node-level warning. With it, controller
 * methods can just `throw new NotFoundError(...)` (or let
 * `ZodError`/`BadRequestError` bubble) and the right status code
 * lands at the client.
 *
 * Use at the route definition site:
 *
 *   router.get("/items/:id", asyncHandler(controller.getItem));
 */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}
