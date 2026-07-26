/**
 * An intervention is a deliberate change you made — a device, a dose, a
 * training programme, a diet, a habit.
 *
 * These are the most important facts in a health history and, until now,
 * the app had nowhere to put them: "Eight Sleep from 2 May" and "Lexapro
 * halved on 8 May" lived as prose in a `notes` column. That is why the
 * dashboard could not answer "did it help?" — every analysis it could run
 * was a continuous correlation, and the question is a changepoint one.
 *
 * Two shapes, because real changes come in both:
 *  - `event`  — a point in time. "Got the Eight Sleep." Nothing ends.
 *  - `period` — a span with a start and an optional end. "20 mg from
 *    7 Mar to 4 May", "lifting 3x/week since 6 Jul" (still running).
 */
export type InterventionKind = "event" | "period";

export type InterventionCategory =
  | "device"
  | "medication"
  | "supplement"
  | "training"
  | "diet"
  | "habit"
  | "other";

/**
 * Manual entries are authored by the user. Derived entries are inferred
 * from data the app already holds (e.g. a dose change visible in
 * `medication.intake`) and are refreshed from that source, so they are
 * not directly editable — edit the underlying data instead.
 */
export type InterventionSource = "manual" | "derived";

export interface Intervention {
  id: number;
  kind: InterventionKind;
  category: InterventionCategory;
  /** Short human label, e.g. "Eight Sleep Pod" or "Escitalopram 10 mg". */
  name: string;
  /** YYYY-MM-DD in the user's calendar. */
  startedOn: string;
  /** YYYY-MM-DD. Null on an event, or on a period that is still running. */
  endedOn: string | null;
  source: InterventionSource;
  /**
   * For derived rows, what produced it — e.g. `medication.item:1`. Also
   * the idempotency key: re-deriving updates the matching row rather than
   * inserting a duplicate.
   */
  sourceRef: string | null;
  detail: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A derived intervention before it is persisted (no id/timestamps yet). */
export type DerivedIntervention = Omit<
  Intervention,
  "id" | "createdAt" | "updatedAt" | "source"
> & { sourceRef: string };

export interface CreateInterventionBody {
  kind: InterventionKind;
  category: InterventionCategory;
  name: string;
  startedOn: string;
  endedOn?: string | null;
  detail?: string | null;
}

export type UpdateInterventionBody = Partial<CreateInterventionBody>;

/** Whether an intervention is in effect on a given day. */
export function isActiveOn(intervention: Intervention, date: string): boolean {
  if (date < intervention.startedOn) return false;
  if (intervention.kind === "event") return date === intervention.startedOn;
  return intervention.endedOn == null || date <= intervention.endedOn;
}
