/**
 * Service-layer error classes shared across all services. Controllers
 * map these to HTTP status codes via `instanceof` checks (404 for
 * NotFoundError, 400 for ValidationError, 500 for everything else).
 *
 * Phase 3 of the audit plan will move that mapping into a single
 * Express error-middleware (`errorMapper`); for now controllers
 * branch on the class.
 *
 * Previously each domain service (supplements, medications,
 * analytics) declared its own NotFoundError/ValidationError. Three
 * structurally-identical classes meant a controller's
 * `err instanceof NotFoundError` could miss a thrown error from a
 * different service module, causing a 500 instead of a 404. Sharing
 * one definition closes that gap.
 */

/**
 * Thrown when a service is asked for an entity that doesn't exist or
 * has been archived. Controllers map this to HTTP 404.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Thrown when input is well-formed but violates business rules (e.g.
 * trying to log an intake of an archived supplement). Controllers map
 * this to HTTP 400.
 *
 * For malformed input (wrong types, missing required fields), prefer
 * Zod validation at the controller boundary — those bubble up as
 * `ZodError` and get mapped separately.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Thrown by controller request-parsing helpers (`controllers/_params.ts`)
 * when query / param / body inputs are malformed (missing required
 * field, wrong type, etc). Distinct from `ValidationError` (which is
 * about business rules failing on well-formed input). Controllers map
 * this to HTTP 400 via `middleware/errorMapper.ts`.
 */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}
