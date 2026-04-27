import type { Pool } from "pg";
import type {
  SupplementItem,
  SupplementIntake,
  SupplementIngredient,
  SupplementItemIngredient,
  SupplementIntakeIngredient,
  CreateSupplementItemBody,
  UpdateSupplementItemBody,
  CreateSupplementIngredientBody,
  UpdateSupplementIngredientBody,
} from "@health-dashboard/shared";
import { toTimestampStr } from "./mappers.js";

/**
 * Repository for the user-input supplement catalog and intake log.
 *
 * Lives in its own `supplement` schema (separate from `universe.*` ingest
 * tables) to make the user-input vs. ingested distinction obvious.
 *
 * Tables are created at server startup via {@link ensureTables}.
 *
 * The composition model:
 * - `supplement.ingredient` is a canonical catalog of substances
 *   (Ashwagandha, L-Theanine, ...). Names are unique case-insensitively.
 * - `supplement.item_ingredient` is the composition junction: per one
 *   default dose of the parent supplement, this row contributes
 *   `amount` of `unit` of `ingredient`.
 * - `supplement.intake_ingredient` is the snapshot of what an intake
 *   actually delivered, scaled by the intake amount.
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

    // Ingredient catalog
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS supplement.ingredient (
        id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name        TEXT NOT NULL,
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Case-insensitive uniqueness so "Ashwagandha" and "ashwagandha" collapse
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_supplement_ingredient_lower_name
        ON supplement.ingredient (LOWER(name))
    `);

    // Composition: one row per (supplement, ingredient) pair
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS supplement.item_ingredient (
        item_id        BIGINT NOT NULL REFERENCES supplement.item(id) ON DELETE CASCADE,
        ingredient_id  BIGINT NOT NULL REFERENCES supplement.ingredient(id) ON DELETE RESTRICT,
        amount         NUMERIC(10,3) NOT NULL,
        unit           TEXT NOT NULL,
        sort_order     INT NOT NULL DEFAULT 0,
        PRIMARY KEY (item_id, ingredient_id)
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ix_supplement_item_ingredient_ingredient
        ON supplement.item_ingredient (ingredient_id)
    `);

    // Per-intake snapshot of the breakdown at log time
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS supplement.intake_ingredient (
        id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        intake_id       BIGINT NOT NULL REFERENCES supplement.intake(id) ON DELETE CASCADE,
        ingredient_id   BIGINT NOT NULL REFERENCES supplement.ingredient(id) ON DELETE RESTRICT,
        ingredient_name TEXT NOT NULL,
        amount          NUMERIC(10,3) NOT NULL,
        unit            TEXT NOT NULL
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ix_supplement_intake_ingredient_intake
        ON supplement.intake_ingredient (intake_id)
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ix_supplement_intake_ingredient_ingredient
        ON supplement.intake_ingredient (ingredient_id)
    `);
  }

  // ---------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------

  async listItems(includeInactive = false): Promise<SupplementItem[]> {
    const where = includeInactive ? "" : "WHERE it.is_active = TRUE";
    const order = includeInactive ? "is_active DESC, name" : "name";
    const { rows } = await this.pool.query(
      `SELECT it.id, it.name, it.brand, it.form, it.default_amount,
              it.default_unit, it.notes, it.is_active, it.created_at, it.updated_at,
              ${ITEM_INGREDIENTS_SUBQUERY} AS ingredients
       FROM supplement.item it
       ${where}
       ORDER BY ${order}`,
    );
    return rows.map(mapItem);
  }

  async getItem(id: number): Promise<SupplementItem | null> {
    const { rows } = await this.pool.query(
      `SELECT it.id, it.name, it.brand, it.form, it.default_amount,
              it.default_unit, it.notes, it.is_active, it.created_at, it.updated_at,
              ${ITEM_INGREDIENTS_SUBQUERY} AS ingredients
       FROM supplement.item it
       WHERE it.id = $1`,
      [id],
    );
    return rows[0] ? mapItem(rows[0]) : null;
  }

  async createItem(body: CreateSupplementItemBody): Promise<SupplementItem> {
    const { rows } = await this.pool.query(
      `INSERT INTO supplement.item (name, brand, form, default_amount, default_unit, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, brand, form, default_amount, default_unit, notes,
                 is_active, created_at, updated_at`,
      [
        body.name,
        body.brand ?? null,
        body.form ?? null,
        body.defaultAmount ?? null,
        body.defaultUnit,
        body.notes ?? null,
      ],
    );
    // New items have no composition yet — synthesize empty array
    return mapItem({ ...rows[0], ingredients: [] });
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
    await this.pool.query(
      `UPDATE supplement.item
         SET ${sets.join(", ")}
       WHERE id = $${n}`,
      values,
    );
    return this.getItem(id);
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

  // ---------------------------------------------------------------------------
  // Intakes
  // ---------------------------------------------------------------------------

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
      `SELECT i.id, i.item_id, it.name AS item_name, i.taken_at, i.amount,
              i.unit, i.notes, i.created_at,
              ${INTAKE_INGREDIENTS_SUBQUERY} AS ingredients
       FROM supplement.intake i
       JOIN supplement.item it ON it.id = i.item_id
       ${where}
       ORDER BY i.taken_at DESC`,
      values,
    );
    return rows.map(mapIntake);
  }

  /**
   * Inserts an intake plus its breakdown rows in a single transaction.
   * The caller (service layer) is responsible for computing the
   * scaled `breakdown` from the item's composition.
   */
  async createIntake(body: {
    itemId: number;
    takenAt: string;
    amount: number;
    unit: string;
    notes: string | null;
    breakdown: Array<{
      ingredientId: number;
      ingredientName: string;
      amount: number;
      unit: string;
    }>;
  }): Promise<SupplementIntake> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO supplement.intake (item_id, taken_at, amount, unit, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, item_id, taken_at, amount, unit, notes, created_at,
                   (SELECT name FROM supplement.item WHERE id = $1) AS item_name`,
        [body.itemId, body.takenAt, body.amount, body.unit, body.notes],
      );
      const intakeRow = rows[0];
      const intakeId = Number(intakeRow.id);

      const ingredientRows: SupplementIntakeIngredient[] = [];
      for (const b of body.breakdown) {
        const { rows: r } = await client.query(
          `INSERT INTO supplement.intake_ingredient
             (intake_id, ingredient_id, ingredient_name, amount, unit)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, ingredient_id, ingredient_name, amount, unit`,
          [intakeId, b.ingredientId, b.ingredientName, b.amount, b.unit],
        );
        ingredientRows.push({
          id: Number(r[0].id),
          ingredientId: Number(r[0].ingredient_id),
          ingredientName: r[0].ingredient_name,
          amount: Number(r[0].amount),
          unit: r[0].unit,
        });
      }
      await client.query("COMMIT");
      return mapIntake({ ...intakeRow, ingredients: ingredientRows });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteIntake(id: number): Promise<boolean> {
    // ON DELETE CASCADE on intake_ingredient handles the breakdown
    const { rowCount } = await this.pool.query(
      `DELETE FROM supplement.intake WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Per-ingredient daily totals across every supplement that contains
   * the ingredient. The window is bounded on the TIMESTAMPTZ
   * `taken_at`, and rows are bucketed into the user's local calendar
   * day via `AT TIME ZONE $userTz` — so an evening intake at 8 PM EDT
   * stacks against today's bar, not tomorrow's.
   *
   * Pass `ingredientId` to filter to a single ingredient — useful when
   * the UI wants to drill into one substance. Otherwise returns rows
   * for every ingredient logged in the window.
   *
   * Sorted ascending by date then ingredient name so the stacked-area
   * chart can consume rows without a second sort.
   */
  async listIngredientByDay(
    start: string,
    end: string,
    userTz: string,
    ingredientId?: number,
  ): Promise<
    Array<{
      date: string;
      ingredientId: number;
      ingredientName: string;
      totalAmount: number;
      unit: string;
    }>
  > {
    const conditions: string[] = [
      `i.taken_at >= $1`,
      `i.taken_at <= $2`,
    ];
    // $3 is the user timezone (used only inside the SELECT/GROUP BY,
    // not in any predicate). Subsequent params start at $4.
    const values: unknown[] = [start, end, userTz];
    let n = 4;
    if (ingredientId != null) {
      conditions.push(`iing.ingredient_id = $${n++}`);
      values.push(ingredientId);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    // Group by ingredient *and* unit so mixed units (mg vs mcg, etc.)
    // never get silently summed across each other.
    const { rows } = await this.pool.query(
      `SELECT to_char(i.taken_at AT TIME ZONE $3, 'YYYY-MM-DD') AS date,
              iing.ingredient_id,
              iing.ingredient_name,
              iing.unit,
              SUM(iing.amount)::numeric AS total_amount
       FROM supplement.intake i
       JOIN supplement.intake_ingredient iing ON iing.intake_id = i.id
       ${where}
       GROUP BY date, iing.ingredient_id, iing.ingredient_name, iing.unit
       ORDER BY date, iing.ingredient_name`,
      values,
    );
    return rows.map((r) => ({
      date: r.date as string,
      ingredientId: Number(r.ingredient_id),
      ingredientName: r.ingredient_name as string,
      totalAmount: Number(r.total_amount),
      unit: r.unit as string,
    }));
  }

  // ---------------------------------------------------------------------------
  // Ingredient catalog
  // ---------------------------------------------------------------------------

  async listIngredients(): Promise<SupplementIngredient[]> {
    const { rows } = await this.pool.query(
      `SELECT id, name, notes, created_at, updated_at
       FROM supplement.ingredient
       ORDER BY name`,
    );
    return rows.map(mapIngredient);
  }

  async getIngredient(id: number): Promise<SupplementIngredient | null> {
    const { rows } = await this.pool.query(
      `SELECT id, name, notes, created_at, updated_at
       FROM supplement.ingredient
       WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapIngredient(rows[0]) : null;
  }

  async findIngredientByName(
    name: string,
  ): Promise<SupplementIngredient | null> {
    const { rows } = await this.pool.query(
      `SELECT id, name, notes, created_at, updated_at
       FROM supplement.ingredient
       WHERE LOWER(name) = LOWER($1)`,
      [name],
    );
    return rows[0] ? mapIngredient(rows[0]) : null;
  }

  async createIngredient(
    body: CreateSupplementIngredientBody,
  ): Promise<SupplementIngredient> {
    const { rows } = await this.pool.query(
      `INSERT INTO supplement.ingredient (name, notes)
       VALUES ($1, $2)
       ON CONFLICT (LOWER(name))
         DO UPDATE SET updated_at = supplement.ingredient.updated_at
       RETURNING id, name, notes, created_at, updated_at`,
      [body.name, body.notes ?? null],
    );
    return mapIngredient(rows[0]);
  }

  async updateIngredient(
    id: number,
    body: UpdateSupplementIngredientBody,
  ): Promise<SupplementIngredient | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let n = 1;
    if (body.name !== undefined) {
      sets.push(`name = $${n++}`);
      values.push(body.name);
    }
    if (body.notes !== undefined) {
      sets.push(`notes = $${n++}`);
      values.push(body.notes);
    }
    if (sets.length === 0) {
      return this.getIngredient(id);
    }
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const { rows } = await this.pool.query(
      `UPDATE supplement.ingredient
         SET ${sets.join(", ")}
       WHERE id = $${n}
       RETURNING id, name, notes, created_at, updated_at`,
      values,
    );
    return rows[0] ? mapIngredient(rows[0]) : null;
  }

  /**
   * Hard-delete an ingredient. Fails (returns false-like / throws via FK)
   * if any item composition or intake snapshot references it.
   */
  async deleteIngredient(id: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM supplement.ingredient WHERE id = $1`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  // ---------------------------------------------------------------------------
  // Item ↔ ingredient composition
  // ---------------------------------------------------------------------------

  async getItemIngredients(itemId: number): Promise<SupplementItemIngredient[]> {
    const { rows } = await this.pool.query(
      `SELECT ii.ingredient_id, ing.name AS ingredient_name,
              ii.amount, ii.unit, ii.sort_order
       FROM supplement.item_ingredient ii
       JOIN supplement.ingredient ing ON ing.id = ii.ingredient_id
       WHERE ii.item_id = $1
       ORDER BY ii.sort_order, ing.name`,
      [itemId],
    );
    return rows.map(mapItemIngredient);
  }

  /**
   * Replace-all set of an item's composition. Each entry must already
   * have a resolved `ingredientId` (the service layer is responsible
   * for find-or-create by name before calling this).
   *
   * Runs in a transaction so partial writes can't leave the composition
   * in a half-modified state.
   */
  async setItemIngredients(
    itemId: number,
    rows: Array<{
      ingredientId: number;
      amount: number;
      unit: string;
      sortOrder: number;
    }>,
  ): Promise<SupplementItemIngredient[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM supplement.item_ingredient WHERE item_id = $1`,
        [itemId],
      );
      for (const r of rows) {
        await client.query(
          `INSERT INTO supplement.item_ingredient
             (item_id, ingredient_id, amount, unit, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [itemId, r.ingredientId, r.amount, r.unit, r.sortOrder],
        );
      }
      await client.query(
        `UPDATE supplement.item SET updated_at = NOW() WHERE id = $1`,
        [itemId],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return this.getItemIngredients(itemId);
  }
}

// JSON-aggregate subqueries used in list/get item and intake queries. Kept as
// constants to avoid duplication and to keep the SELECTs readable.
const ITEM_INGREDIENTS_SUBQUERY = `
  COALESCE(
    (
      SELECT json_agg(
               json_build_object(
                 'ingredientId', ii.ingredient_id,
                 'ingredientName', ing.name,
                 'amount', ii.amount,
                 'unit', ii.unit,
                 'sortOrder', ii.sort_order
               )
               ORDER BY ii.sort_order, ing.name
             )
      FROM supplement.item_ingredient ii
      JOIN supplement.ingredient ing ON ing.id = ii.ingredient_id
      WHERE ii.item_id = it.id
    ),
    '[]'::json
  )
`;

const INTAKE_INGREDIENTS_SUBQUERY = `
  COALESCE(
    (
      SELECT json_agg(
               json_build_object(
                 'id', iing.id,
                 'ingredientId', iing.ingredient_id,
                 'ingredientName', iing.ingredient_name,
                 'amount', iing.amount,
                 'unit', iing.unit
               )
               ORDER BY iing.id
             )
      FROM supplement.intake_ingredient iing
      WHERE iing.intake_id = i.id
    ),
    '[]'::json
  )
`;

function mapItem(row: Record<string, unknown>): SupplementItem {
  const rawIngredients = (row.ingredients as
    | Array<Record<string, unknown>>
    | null
    | undefined) ?? [];
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
    ingredients: rawIngredients.map((r) => ({
      ingredientId: Number(r.ingredientId),
      ingredientName: String(r.ingredientName),
      amount: Number(r.amount),
      unit: String(r.unit),
      sortOrder: Number(r.sortOrder ?? 0),
    })),
  };
}

function mapIntake(row: Record<string, unknown>): SupplementIntake {
  const rawIngredients = (row.ingredients as
    | Array<Record<string, unknown>>
    | null
    | undefined) ?? [];
  return {
    id: Number(row.id),
    itemId: Number(row.item_id),
    itemName: row.item_name as string,
    takenAt: toTimestampStr(row.taken_at) ?? "",
    amount: Number(row.amount),
    unit: row.unit as string,
    notes: (row.notes as string | null) ?? null,
    createdAt: toTimestampStr(row.created_at) ?? "",
    ingredients: rawIngredients.map((r) => ({
      id: Number(r.id),
      ingredientId: Number(r.ingredientId),
      ingredientName: String(r.ingredientName),
      amount: Number(r.amount),
      unit: String(r.unit),
    })),
  };
}

function mapIngredient(row: Record<string, unknown>): SupplementIngredient {
  return {
    id: Number(row.id),
    name: row.name as string,
    notes: (row.notes as string | null) ?? null,
    createdAt: toTimestampStr(row.created_at) ?? "",
    updatedAt: toTimestampStr(row.updated_at) ?? "",
  };
}

function mapItemIngredient(
  row: Record<string, unknown>,
): SupplementItemIngredient {
  return {
    ingredientId: Number(row.ingredient_id),
    ingredientName: row.ingredient_name as string,
    amount: Number(row.amount),
    unit: row.unit as string,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

