import type { Pool } from "pg";
import type {
  SupplementItem,
  SupplementIntake,
  CreateSupplementItemBody,
  UpdateSupplementItemBody,
  CreateSupplementIntakeBody,
} from "@health-dashboard/shared";
import { toTimestampStr } from "./mappers.js";

/**
 * Repository for the user-input supplement catalog and intake log.
 *
 * Lives in its own `supplement` schema (separate from `universe.*` ingest
 * tables) to make the user-input vs. ingested distinction obvious.
 *
 * Tables are created at server startup via {@link ensureTables}.
 */
export class SupplementRepository {
  constructor(private pool: Pool) {}

  async ensureTables(): Promise<void> {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS supplement`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS supplement.item (
        id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name            TEXT NOT NULL,
        brand           TEXT,
        form            TEXT,
        default_amount  NUMERIC(10,3),
        default_unit    TEXT NOT NULL,
        notes           TEXT,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ix_supplement_item_active
        ON supplement.item (is_active, name)
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS supplement.intake (
        id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        item_id     BIGINT NOT NULL REFERENCES supplement.item(id) ON DELETE RESTRICT,
        taken_at    TIMESTAMPTZ NOT NULL,
        amount      NUMERIC(10,3) NOT NULL,
        unit        TEXT NOT NULL,
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ix_supplement_intake_taken_at
        ON supplement.intake (taken_at DESC)
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ix_supplement_intake_item_time
        ON supplement.intake (item_id, taken_at DESC)
    `);
  }

  async listItems(includeInactive = false): Promise<SupplementItem[]> {
    const sql = includeInactive
      ? `SELECT id, name, brand, form, default_amount, default_unit, notes, is_active, created_at, updated_at
         FROM supplement.item
         ORDER BY is_active DESC, name`
      : `SELECT id, name, brand, form, default_amount, default_unit, notes, is_active, created_at, updated_at
         FROM supplement.item
         WHERE is_active = TRUE
         ORDER BY name`;
    const { rows } = await this.pool.query(sql);
    return rows.map(mapItem);
  }

  async getItem(id: number): Promise<SupplementItem | null> {
    const { rows } = await this.pool.query(
      `SELECT id, name, brand, form, default_amount, default_unit, notes, is_active, created_at, updated_at
       FROM supplement.item
       WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapItem(rows[0]) : null;
  }

  async createItem(body: CreateSupplementItemBody): Promise<SupplementItem> {
    const { rows } = await this.pool.query(
      `INSERT INTO supplement.item (name, brand, form, default_amount, default_unit, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, brand, form, default_amount, default_unit, notes, is_active, created_at, updated_at`,
      [
        body.name,
        body.brand ?? null,
        body.form ?? null,
        body.defaultAmount ?? null,
        body.defaultUnit,
        body.notes ?? null,
      ],
    );
    return mapItem(rows[0]);
  }

  async updateItem(
    id: number,
    body: UpdateSupplementItemBody,
  ): Promise<SupplementItem | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let n = 1;
    const push = (col: string, v: unknown) => {
      sets.push(`${col} = $${n++}`);
      values.push(v);
    };
    if (body.name !== undefined) push("name", body.name);
    if (body.brand !== undefined) push("brand", body.brand);
    if (body.form !== undefined) push("form", body.form);
    if (body.defaultAmount !== undefined)
      push("default_amount", body.defaultAmount);
    if (body.defaultUnit !== undefined) push("default_unit", body.defaultUnit);
    if (body.notes !== undefined) push("notes", body.notes);
    if (body.isActive !== undefined) push("is_active", body.isActive);
    if (sets.length === 0) {
      return this.getItem(id);
    }
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const { rows } = await this.pool.query(
      `UPDATE supplement.item
         SET ${sets.join(", ")}
       WHERE id = $${n}
       RETURNING id, name, brand, form, default_amount, default_unit, notes, is_active, created_at, updated_at`,
      values,
    );
    return rows[0] ? mapItem(rows[0]) : null;
  }

  /** Soft delete: set is_active=false. Returns true if the row existed. */
  async archiveItem(id: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE supplement.item
         SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async listIntakes(
    start?: string,
    end?: string,
    itemId?: number,
  ): Promise<SupplementIntake[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let n = 1;
    if (start) {
      conditions.push(`i.taken_at >= $${n++}`);
      values.push(start);
    }
    if (end) {
      conditions.push(`i.taken_at <= $${n++}`);
      values.push(end);
    }
    if (itemId != null) {
      conditions.push(`i.item_id = $${n++}`);
      values.push(itemId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT i.id, i.item_id, it.name AS item_name, i.taken_at, i.amount, i.unit, i.notes, i.created_at
       FROM supplement.intake i
       JOIN supplement.item it ON it.id = i.item_id
       ${where}
       ORDER BY i.taken_at DESC`,
      values,
    );
    return rows.map(mapIntake);
  }

  async createIntake(body: {
    itemId: number;
    takenAt: string;
    amount: number;
    unit: string;
    notes: string | null;
  }): Promise<SupplementIntake> {
    const { rows } = await this.pool.query(
      `INSERT INTO supplement.intake (item_id, taken_at, amount, unit, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, item_id, taken_at, amount, unit, notes, created_at,
                 (SELECT name FROM supplement.item WHERE id = $1) AS item_name`,
      [body.itemId, body.takenAt, body.amount, body.unit, body.notes],
    );
    return mapIntake(rows[0]);
  }

  async deleteIntake(id: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM supplement.intake WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}

function mapItem(row: Record<string, unknown>): SupplementItem {
  return {
    id: Number(row.id),
    name: row.name as string,
    brand: (row.brand as string | null) ?? null,
    form: (row.form as string | null) ?? null,
    defaultAmount:
      row.default_amount != null ? Number(row.default_amount) : null,
    defaultUnit: row.default_unit as string,
    notes: (row.notes as string | null) ?? null,
    isActive: row.is_active as boolean,
    createdAt: toTimestampStr(row.created_at) ?? "",
    updatedAt: toTimestampStr(row.updated_at) ?? "",
  };
}

function mapIntake(row: Record<string, unknown>): SupplementIntake {
  return {
    id: Number(row.id),
    itemId: Number(row.item_id),
    itemName: row.item_name as string,
    takenAt: toTimestampStr(row.taken_at) ?? "",
    amount: Number(row.amount),
    unit: row.unit as string,
    notes: (row.notes as string | null) ?? null,
    createdAt: toTimestampStr(row.created_at) ?? "",
  };
}
