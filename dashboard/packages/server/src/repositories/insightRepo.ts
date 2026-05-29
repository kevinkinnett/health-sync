import type { Pool } from "pg";
import type {
  ChatConversationSummary,
  InsightGenerationSummary,
} from "@health-dashboard/shared";
import { toDateStr, toTimestampStr } from "./mappers.js";

// ---------------------------------------------------------------------------
// Server-internal DB record shapes
// ---------------------------------------------------------------------------
//
// Wire shapes the dashboard consumes live in `@health-dashboard/shared`
// (`InsightGenerationSummary`, `ChatConversationSummary`, etc). The
// types below are the row shapes the repository hands back internally —
// they carry the surrogate `id` and the full 3-way `role` (`tool`
// included), neither of which the UI needs.

/** Internal: a single row of `universe.health_insight`. */
export interface InsightCategoryRecord {
  id: number;
  generationId: string;
  category: string;
  title: string;
  content: string;
  dateFrom: string;
  dateTo: string;
  createdAt: string;
}

export type ChatRole = "user" | "assistant" | "tool";

/**
 * Internal: a single row of `universe.health_insight_chat`. Includes
 * `tool` rows and `tool_calls` JSONB which the UI never sees but the
 * agentic loop replays on every turn.
 */
export interface ChatRecord {
  id: number;
  conversationId: string;
  role: ChatRole;
  content: string | null;
  /** OpenAI-shape tool_calls array; populated on assistant rows that
   *  emitted tool calls. */
  toolCalls: unknown | null;
  /** For role=tool rows, the call id this row is the result of. */
  toolCallId: string | null;
  toolName: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Storage for the AI Insights + Chat surfaces.
 *
 * Two tables, both under the `universe` schema:
 *
 * - `health_insight` — one row per (generation, category) pair. A single
 *   "Generate" click produces six rows (one per category) sharing the
 *   same `generation_id` UUID. Listing groups by that UUID.
 *
 * - `health_insight_chat` — full conversation log including assistant
 *   tool_calls and tool result rows. The UI reads ONLY user+assistant
 *   text rows, but the model gets the full transcript on every turn so
 *   it has grounded context (no narrative recap drift).
 */
export class InsightRepository {
  constructor(private pool: Pool) {}

  async ensureTables(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS universe.health_insight (
        id              SERIAL PRIMARY KEY,
        generation_id   UUID NOT NULL,
        category        TEXT NOT NULL,
        title           TEXT NOT NULL,
        content         TEXT NOT NULL,
        date_from       DATE NOT NULL,
        date_to         DATE NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_health_insight_generation
        ON universe.health_insight (generation_id, created_at);
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_health_insight_created
        ON universe.health_insight (created_at DESC);
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS universe.health_insight_chat (
        id              SERIAL PRIMARY KEY,
        conversation_id UUID NOT NULL,
        role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
        content         TEXT,
        tool_calls      JSONB,
        tool_call_id    TEXT,
        tool_name       TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_health_insight_chat_conv
        ON universe.health_insight_chat (conversation_id, id);
    `);
  }

  // ------ Insights -------------------------------------------------------

  async listGenerations(limit = 50): Promise<InsightGenerationSummary[]> {
    const { rows } = await this.pool.query(
      `SELECT generation_id,
              MAX(created_at) AS created_at,
              MIN(date_from)  AS date_from,
              MAX(date_to)    AS date_to,
              COUNT(*)::int   AS category_count
       FROM universe.health_insight
       GROUP BY generation_id
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 200))],
    );
    return rows.map((r) => ({
      generationId: r.generation_id as string,
      // created_at is TIMESTAMPTZ (Date); date_from/date_to are DATE,
      // which the global pg parser (registered in src/db) returns as
      // YYYY-MM-DD STRINGS — calling .toISOString() on those threw and
      // 500'd this endpoint. The mappers handle both string and Date.
      createdAt: toTimestampStr(r.created_at) ?? "",
      dateFrom: toDateStr(r.date_from),
      dateTo: toDateStr(r.date_to),
      categoryCount: r.category_count as number,
    }));
  }

  async getGeneration(generationId: string): Promise<InsightCategoryRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT id, generation_id, category, title, content,
              date_from, date_to, created_at
       FROM universe.health_insight
       WHERE generation_id = $1
       ORDER BY id`,
      [generationId],
    );
    return rows.map(this.toInsightRow);
  }

  async insertCategoryRow(row: {
    generationId: string;
    category: string;
    title: string;
    content: string;
    dateFrom: string;
    dateTo: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO universe.health_insight
        (generation_id, category, title, content, date_from, date_to)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        row.generationId,
        row.category,
        row.title,
        row.content,
        row.dateFrom,
        row.dateTo,
      ],
    );
  }

  async deleteGeneration(generationId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM universe.health_insight WHERE generation_id = $1`,
      [generationId],
    );
    return rowCount ?? 0;
  }

  private toInsightRow(r: Record<string, unknown>): InsightCategoryRecord {
    return {
      id: r.id as number,
      generationId: r.generation_id as string,
      category: r.category as string,
      title: r.title as string,
      content: r.content as string,
      // date_from/date_to are DATE → strings via the pg parser; the
      // mappers tolerate both string and Date so this can't 500.
      dateFrom: toDateStr(r.date_from),
      dateTo: toDateStr(r.date_to),
      createdAt: toTimestampStr(r.created_at) ?? "",
    };
  }

  // ------ Chat ----------------------------------------------------------

  async appendChatRecord(row: {
    conversationId: string;
    role: ChatRole;
    content: string | null;
    toolCalls?: unknown | null;
    toolCallId?: string | null;
    toolName?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO universe.health_insight_chat
        (conversation_id, role, content, tool_calls, tool_call_id, tool_name)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        row.conversationId,
        row.role,
        row.content,
        row.toolCalls != null ? JSON.stringify(row.toolCalls) : null,
        row.toolCallId ?? null,
        row.toolName ?? null,
      ],
    );
  }

  /** Full transcript including tool turns — fed back to the LLM for context. */
  async getFullConversation(conversationId: string): Promise<ChatRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT id, conversation_id, role, content, tool_calls,
              tool_call_id, tool_name, created_at
       FROM universe.health_insight_chat
       WHERE conversation_id = $1
       ORDER BY id`,
      [conversationId],
    );
    return rows.map(this.toChatRecord);
  }

  /** UI-visible transcript — only user + assistant text rows. */
  async getDisplayConversation(conversationId: string): Promise<ChatRecord[]> {
    const { rows } = await this.pool.query(
      `SELECT id, conversation_id, role, content, tool_calls,
              tool_call_id, tool_name, created_at
       FROM universe.health_insight_chat
       WHERE conversation_id = $1
         AND role IN ('user', 'assistant')
         AND content IS NOT NULL
       ORDER BY id`,
      [conversationId],
    );
    return rows.map(this.toChatRecord);
  }

  async listConversations(limit = 20): Promise<ChatConversationSummary[]> {
    const { rows } = await this.pool.query(
      `WITH latest AS (
         SELECT conversation_id,
                MAX(created_at) AS last_message_at,
                COUNT(*) FILTER (WHERE role IN ('user','assistant') AND content IS NOT NULL)::int AS message_count
         FROM universe.health_insight_chat
         GROUP BY conversation_id
       ),
       firsts AS (
         SELECT DISTINCT ON (conversation_id) conversation_id, content
         FROM universe.health_insight_chat
         WHERE role = 'user' AND content IS NOT NULL
         ORDER BY conversation_id, id
       )
       SELECT l.conversation_id, l.last_message_at, l.message_count,
              COALESCE(f.content, '(empty)') AS preview
       FROM latest l
       LEFT JOIN firsts f USING (conversation_id)
       WHERE l.message_count > 0
       ORDER BY l.last_message_at DESC
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 200))],
    );
    return rows.map((r) => ({
      conversationId: r.conversation_id as string,
      lastMessageAt: toTimestampStr(r.last_message_at) ?? "",
      messageCount: r.message_count as number,
      preview: r.preview as string,
    }));
  }

  async deleteConversation(conversationId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM universe.health_insight_chat WHERE conversation_id = $1`,
      [conversationId],
    );
    return rowCount ?? 0;
  }

  private toChatRecord(r: Record<string, unknown>): ChatRecord {
    return {
      id: r.id as number,
      conversationId: r.conversation_id as string,
      role: r.role as ChatRole,
      content: (r.content as string | null) ?? null,
      toolCalls: r.tool_calls ?? null,
      toolCallId: (r.tool_call_id as string | null) ?? null,
      toolName: (r.tool_name as string | null) ?? null,
      createdAt: toTimestampStr(r.created_at) ?? "",
    };
  }
}
