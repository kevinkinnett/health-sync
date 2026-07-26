import type { DerivedIntervention } from "@health-dashboard/shared";

/**
 * A source that can infer interventions from data the app already holds.
 *
 * The point of the port is that adding "detect when a supplement started"
 * or "detect a device coming online from its first ingest row" is a new
 * implementation, not a change to `InterventionService`. The service
 * iterates sources; it knows nothing about medication doses.
 *
 * `today` is passed in rather than read from the clock so derivation is a
 * pure function of its inputs and can be tested without freezing time.
 */
export interface InterventionDeriver {
  /** Stable identifier, used in logs and to attribute failures. */
  readonly id: string;
  derive(today: string): Promise<DerivedIntervention[]>;
}

/** One logged dose. The narrowest view the dose deriver needs. */
export interface DoseRecord {
  itemId: number;
  itemName: string;
  /** YYYY-MM-DD in the user's calendar. */
  date: string;
  amount: number;
  unit: string;
}

/** Just the slice of the medication store this deriver depends on. */
export interface DoseHistorySource {
  listDoseHistory(): Promise<DoseRecord[]>;
}

/**
 * A dose run is considered still current if its last logged day is within
 * this many days of today. Dosing is daily, so a gap longer than this
 * means the regimen stopped rather than "hasn't been logged yet".
 */
const ONGOING_GRACE_DAYS = 10;

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Turns dose history into one `period` intervention per contiguous run at
 * the same dose.
 *
 * Kevin's escitalopram history is the worked example: 20 mg from March,
 * halved to 10 mg in May. That is two runs, and the boundary between them
 * is exactly the changepoint a "did it work?" question needs — it was
 * previously recoverable only from a prose note on the item.
 *
 * A run is closed when the next logged dose differs. The final run stays
 * open (`endedOn: null`) when it reaches up to today, because an ongoing
 * regimen has no end date.
 */
export class MedicationDoseDeriver implements InterventionDeriver {
  readonly id = "medication-dose";

  constructor(private readonly source: DoseHistorySource) {}

  async derive(today: string): Promise<DerivedIntervention[]> {
    const history = await this.source.listDoseHistory();

    // Group by item, preserving date order within each.
    const byItem = new Map<number, DoseRecord[]>();
    for (const rec of history) {
      const list = byItem.get(rec.itemId);
      if (list) list.push(rec);
      else byItem.set(rec.itemId, [rec]);
    }

    const out: DerivedIntervention[] = [];
    for (const records of byItem.values()) {
      const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
      for (const run of splitIntoDoseRuns(sorted)) {
        const last = run[run.length - 1];
        const first = run[0];
        const ongoing = daysBetween(last.date, today) <= ONGOING_GRACE_DAYS;
        out.push({
          kind: "period",
          category: "medication",
          name: `${first.itemName} ${formatAmount(first.amount)} ${first.unit}`,
          startedOn: first.date,
          endedOn: ongoing ? null : last.date,
          sourceRef: `medication.item:${first.itemId}:dose:${first.amount}:${first.date}`,
          detail: `${run.length} logged doses${ongoing ? ", ongoing" : ""}`,
        });
      }
    }
    return out;
  }
}

/** Splits date-ordered records wherever the dose changes. */
function splitIntoDoseRuns(sorted: DoseRecord[]): DoseRecord[][] {
  const runs: DoseRecord[][] = [];
  let current: DoseRecord[] = [];
  for (const rec of sorted) {
    const prev = current[current.length - 1];
    const sameDose =
      prev && prev.amount === rec.amount && prev.unit === rec.unit;
    if (!prev || sameDose) {
      current.push(rec);
    } else {
      runs.push(current);
      current = [rec];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/** `10` not `10.000`, but keep a genuine fraction. */
function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : String(amount);
}
