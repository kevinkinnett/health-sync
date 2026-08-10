import type { Pool } from "pg";
import type {
  CreateInterventionBody,
  DerivedIntervention,
  Intervention,
  InterventionSource,
} from "@health-dashboard/shared";
import { toDateStr } from "./mappers.js";

/**
 * Persistence for interventions. Storage only — no domain rules, no
 * derivation: validation lives in `InterventionService` and inference in
 * the `InterventionSource` implementations, so each has one reason to
 * change.
 */
export class InterventionRepository {
  constructor(private pool: Pool) {}

  async findAll(): Promise<Intervention[]> {
    const { rows } = await this.pool.query(
      `${SELECT} ORDER BY started_on DESC, id DESC`,
    );
    return rows.map(mapRow);
  }

  /** Interventions overlapping [start, end]; an open period counts. */
  async findOverlapping(start: string, end: string): Promise<Intervention[]> {
    const { rows } = await this.pool.query(
      `${SELECT}
        WHERE started_on <= $2
          AND (ended_on IS NULL OR ended_on >= $1)
        ORDER BY started_on DESC, id DESC`,
      [start, end],
    );
    return rows.map(mapRow);
  }

  async findById(id: number): Promise<Intervention | null> {
    const { rows } = await this.pool.query(`${SELECT} WHERE id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async create(
    body: CreateInterventionBody,
    source: InterventionSource = "manual",
    sourceRef: string | null = null,
  ): Promise<Intervention> {
    const { rows } = await this.pool.query(
      `INSERT INTO universe.intervention
         (kind, category, name, started_on, ended_on, source, source_ref, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        body.kind,
        body.category,
        body.name,
        body.startedOn,
        body.endedOn ?? null,
        source,
        sourceRef,
        body.detail ?? null,
      ],
    );
    return mapRow(rows[0]);
  }

  /**
   * Applies a partial update. Absent keys are left untouched via
   * `COALESCE`, so a caller can patch one field without re-sending the
   * row. `endedOn` is deliberately excluded from that treatment — see
   * `clearEndedOn`, since null is a meaningful value there.
   */
  async update(
    id: number,
    patch: Partial<CreateInterventionBody>,
    clearEndedOn = false,
  ): Promise<Intervention | null> {
    const { rows } = await this.pool.query(
      `UPDATE universe.intervention SET
         kind       = COALESCE($2, kind),
         category   = COALESCE($3, category),
         name       = COALESCE($4, name),
         started_on = COALESCE($5, started_on),
         ended_on   = CASE WHEN $6 THEN NULL ELSE COALESCE($7, ended_on) END,
         detail     = COALESCE($8, detail),
         updated_at = NOW()
       WHERE id = $1
       RETURNING ${COLUMNS}`,
      [
        id,
        patch.kind ?? null,
        patch.category ?? null,
        patch.name ?? null,
        patch.startedOn ?? null,
        clearEndedOn,
        patch.endedOn ?? null,
        patch.detail ?? null,
      ],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  async remove(id: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM universe.intervention WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Upserts a batch of derived rows on `source_ref`. Returns how many
   * landed. Manual rows are never touched: the partial unique index only
   * covers rows that carry a `source_ref`.
   */
  async upsertDerived(items: DerivedIntervention[]): Promise<number> {
    let n = 0;
    for (const item of items) {
      await this.pool.query(
        `INSERT INTO universe.intervention
           (kind, category, name, started_on, ended_on, source, source_ref, detail)
         VALUES ($1, $2, $3, $4, $5, 'derived', $6, $7)
         ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL
         DO UPDATE SET
           kind = EXCLUDED.kind,
           category = EXCLUDED.category,
           name = EXCLUDED.name,
           started_on = EXCLUDED.started_on,
           ended_on = EXCLUDED.ended_on,
           detail = EXCLUDED.detail,
           updated_at = NOW()`,
        [
          item.kind,
          item.category,
          item.name,
          item.startedOn,
          item.endedOn,
          item.sourceRef,
          item.detail,
        ],
      );
      n++;
    }
    return n;
  }
}

const COLUMNS = `id, kind, category, name, started_on, ended_on,
                 source, source_ref, detail, created_at, updated_at`;

const SELECT = `SELECT ${COLUMNS} FROM universe.intervention`;

function mapRow(row: Record<string, unknown>): Intervention {
  return {
    id: Number(row.id),
    kind: row.kind as Intervention["kind"],
    category: row.category as Intervention["category"],
    name: String(row.name),
    startedOn: toDateStr(row.started_on),
    endedOn: row.ended_on != null ? toDateStr(row.ended_on) : null,
    source: row.source as InterventionSource,
    sourceRef: row.source_ref != null ? String(row.source_ref) : null,
    detail: row.detail != null ? String(row.detail) : null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}
