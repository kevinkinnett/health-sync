import type { Pool } from "pg";
import type {
  DossierContent,
  DossierEntry,
  DossierItemType,
} from "@health-dashboard/shared";
import { toTimestampStr } from "./mappers.js";

export type DossierUsageStatus =
  | "ok"
  | "parse_error"
  | "validation_error"
  | "http_error";

/** Inputs for {@link DossierRepository.recordUsage}. */
export interface DossierUsageRow {
  itemType?: DossierItemType;
  itemId?: number;
  requestedModel: string;
  actualModel?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
  durationMs: number;
  status: DossierUsageStatus;
}

/**
 * Inputs for {@link DossierRepository.upsert}. Mirrors {@link DossierEntry}
 * but the timestamp comes from the DB so we don't pass it.
 */
export interface UpsertDossierInput {
  itemType: DossierItemType;
  itemId: number;
  itemName: string;
  itemBrand: string | null;
  itemForm: string | null;
  content: DossierContent;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export class DossierRepository {
  constructor(private pool: Pool) {}

  async ensureTables(): Promise<void> {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS dossier`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dossier.entry (
        id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        item_type     TEXT NOT NULL CHECK (item_type IN ('supplement', 'medication')),
        item_id       BIGINT NOT NULL,
        item_name     TEXT NOT NULL,
        item_brand    TEXT,
        item_form     TEXT,
        content       JSONB NOT NULL,
        model         TEXT NOT NULL,
        input_tokens  INT,
        output_tokens INT,
        fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (item_type, item_id)
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ix_dossier_entry_type_id
        ON dossier.entry (item_type, item_id)
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dossier.llm_usage (
        id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        task              TEXT NOT NULL,
        item_type         TEXT,
        item_id           BIGINT,
        requested_model   TEXT NOT NULL,
        actual_model      TEXT,
        prompt_tokens     INT,
        completion_tokens INT,
        reasoning_tokens  INT,
        duration_ms       INT NOT NULL,
        status            TEXT NOT NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ix_dossier_llm_usage_created
        ON dossier.llm_usage (created_at DESC)
    `);
  }

  async get(
    itemType: DossierItemType,
    itemId: number,
  ): Promise<DossierEntry | null> {
    const { rows } = await this.pool.query(
      `SELECT item_type, item_id, item_name, item_brand, item_form,
              content, model, input_tokens, output_tokens, fetched_at
       FROM dossier.entry
       WHERE item_type = $1 AND item_id = $2`,
      [itemType, itemId],
    );
    return rows[0] ? mapEntry(rows[0]) : null;
  }

  async upsert(input: UpsertDossierInput): Promise<DossierEntry> {
    const { rows } = await this.pool.query(
      `INSERT INTO dossier.entry
         (item_type, item_id, item_name, item_brand, item_form,
          content, model, input_tokens, output_tokens, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (item_type, item_id) DO UPDATE
         SET item_name     = EXCLUDED.item_name,
             item_brand    = EXCLUDED.item_brand,
             item_form     = EXCLUDED.item_form,
             content       = EXCLUDED.content,
             model         = EXCLUDED.model,
             input_tokens  = EXCLUDED.input_tokens,
             output_tokens = EXCLUDED.output_tokens,
             fetched_at    = NOW()
       RETURNING item_type, item_id, item_name, item_brand, item_form,
                 content, model, input_tokens, output_tokens, fetched_at`,
      [
        input.itemType,
        input.itemId,
        input.itemName,
        input.itemBrand,
        input.itemForm,
        input.content,
        input.model,
        input.inputTokens,
        input.outputTokens,
      ],
    );
    return mapEntry(rows[0]);
  }

  async delete(
    itemType: DossierItemType,
    itemId: number,
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM dossier.entry WHERE item_type = $1 AND item_id = $2`,
      [itemType, itemId],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Append-only usage row. Failures here are swallowed so a logging glitch
   * never causes a successful dossier refresh to surface as a 5xx — the
   * caller has already done the user-visible work by the time we get here.
   */
  async recordUsage(row: DossierUsageRow): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO dossier.llm_usage
           (task, item_type, item_id, requested_model, actual_model,
            prompt_tokens, completion_tokens, reasoning_tokens,
            duration_ms, status)
         VALUES ('dossier', $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.itemType ?? null,
          row.itemId ?? null,
          row.requestedModel,
          row.actualModel ?? null,
          row.promptTokens ?? null,
          row.completionTokens ?? null,
          row.reasoningTokens ?? null,
          row.durationMs,
          row.status,
        ],
      );
    } catch {
      // Intentionally swallowed; usage logging is best-effort.
    }
  }
}

function mapEntry(row: Record<string, unknown>): DossierEntry {
  return {
    itemType: row.item_type as DossierItemType,
    itemId: Number(row.item_id),
    itemName: row.item_name as string,
    itemBrand: (row.item_brand as string | null) ?? null,
    itemForm: (row.item_form as string | null) ?? null,
    content: row.content as DossierContent,
    model: row.model as string,
    inputTokens: row.input_tokens != null ? Number(row.input_tokens) : null,
    outputTokens:
      row.output_tokens != null ? Number(row.output_tokens) : null,
    fetchedAt: toTimestampStr(row.fetched_at) ?? "",
  };
}
