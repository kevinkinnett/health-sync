import type {
  CreateInterventionBody,
  Intervention,
  UpdateInterventionBody,
} from "@health-dashboard/shared";
import { z } from "zod";
import { BadRequestError, NotFoundError } from "../errors.js";
import { logger } from "../../logger.js";
import type { InterventionDeriver } from "./deriver.js";

/**
 * Domain rules for interventions.
 *
 * Depends on a narrow store port and a list of derivers rather than the
 * concrete repository and the medication store, so: adding a new source
 * of derived interventions requires no change here (open/closed), and the
 * whole service is testable against an in-memory store.
 */
export interface InterventionStore {
  findAll(): Promise<Intervention[]>;
  findOverlapping(start: string, end: string): Promise<Intervention[]>;
  findById(id: number): Promise<Intervention | null>;
  create(body: CreateInterventionBody): Promise<Intervention>;
  update(
    id: number,
    patch: Partial<CreateInterventionBody>,
    clearEndedOn?: boolean,
  ): Promise<Intervention | null>;
  remove(id: number): Promise<boolean>;
  upsertDerived(
    items: Awaited<ReturnType<InterventionDeriver["derive"]>>,
  ): Promise<number>;
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/**
 * Kept unrefined so `.partial()` is available for PATCH — `superRefine`
 * returns a ZodEffects, which cannot be made partial. The cross-field
 * rules are re-applied to the MERGED row in `update()`, which is the only
 * place they can be judged correctly anyway.
 */
const baseSchema = z.object({
  kind: z.enum(["event", "period"]),
  category: z.enum([
    "device",
    "medication",
    "supplement",
    "training",
    "diet",
    "habit",
    "other",
  ]),
  name: z.string().trim().min(1, "name is required").max(120),
  startedOn: DATE,
  endedOn: DATE.nullish(),
  detail: z.string().trim().max(2000).nullish(),
});

const createSchema = baseSchema.superRefine((v, ctx) => {
    // An event is a point in time; an end date is meaningless on it, and
    // silently dropping one would hide a mistake in the caller.
    if (v.kind === "event" && v.endedOn != null) {
      ctx.addIssue({
        code: "custom",
        path: ["endedOn"],
        message: "an event has no end date — use kind 'period'",
      });
    }
    if (v.endedOn != null && v.endedOn < v.startedOn) {
      ctx.addIssue({
        code: "custom",
        path: ["endedOn"],
        message: "endedOn must be on or after startedOn",
      });
    }
  });

export class InterventionService {
  constructor(
    private readonly store: InterventionStore,
    private readonly derivers: InterventionDeriver[] = [],
  ) {}

  async list(): Promise<Intervention[]> {
    return this.store.findAll();
  }

  /** Interventions in effect at any point within [start, end]. */
  async listOverlapping(start: string, end: string): Promise<Intervention[]> {
    if (start > end) {
      throw new BadRequestError("start must be <= end");
    }
    return this.store.findOverlapping(start, end);
  }

  async get(id: number): Promise<Intervention> {
    const found = await this.store.findById(id);
    if (!found) throw new NotFoundError(`Intervention ${id} not found`);
    return found;
  }

  async create(body: unknown): Promise<Intervention> {
    const parsed = parse(createSchema, body);
    return this.store.create(parsed as CreateInterventionBody);
  }

  async update(id: number, body: unknown): Promise<Intervention> {
    const existing = await this.get(id);
    if (existing.source === "derived") {
      throw new BadRequestError(
        "This intervention is derived from your logged data — edit the " +
          "underlying medication or supplement instead.",
      );
    }
    const parsed = parse(baseSchema.partial(), body) as UpdateInterventionBody;

    // Validate the RESULT, not just the patch: clearing an end date or
    // moving a start date can only be judged against the merged row.
    const merged = { ...existing, ...stripUndefined(parsed) };
    if (merged.kind === "event" && merged.endedOn != null) {
      throw new BadRequestError("an event has no end date — use kind 'period'");
    }
    if (merged.endedOn != null && merged.endedOn < merged.startedOn) {
      throw new BadRequestError("endedOn must be on or after startedOn");
    }

    // `endedOn: null` in the payload means "clear it", which COALESCE in
    // the repository cannot express on its own.
    const clearEndedOn =
      Object.prototype.hasOwnProperty.call(parsed, "endedOn") &&
      parsed.endedOn == null;

    const updated = await this.store.update(id, parsed, clearEndedOn);
    if (!updated) throw new NotFoundError(`Intervention ${id} not found`);
    return updated;
  }

  async remove(id: number): Promise<void> {
    const existing = await this.get(id);
    if (existing.source === "derived") {
      throw new BadRequestError(
        "This intervention is derived from your logged data and cannot be " +
          "deleted directly.",
      );
    }
    await this.store.remove(id);
  }

  /**
   * Re-runs every deriver and upserts the results. Idempotent: derived
   * rows are keyed by `sourceRef`, so this converges rather than
   * accumulating duplicates.
   *
   * One failing deriver must not deny the others — a broken medication
   * query shouldn't stop device detection — so failures are logged and
   * skipped rather than propagated.
   */
  async refreshDerived(today: string): Promise<{
    derived: number;
    bySource: Record<string, number | string>;
  }> {
    const bySource: Record<string, number | string> = {};
    let total = 0;

    for (const deriver of this.derivers) {
      try {
        const items = await deriver.derive(today);
        const n = await this.store.upsertDerived(items);
        bySource[deriver.id] = n;
        total += n;
      } catch (err) {
        const message = (err as Error).message;
        logger.warn(
          { deriver: deriver.id, err: message },
          "Intervention deriver failed; skipping",
        );
        bySource[deriver.id] = `error: ${message}`;
      }
    }
    return { derived: total, bySource };
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BadRequestError(
      `${first.path.join(".") || "body"}: ${first.message}`,
    );
  }
  return result.data;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
