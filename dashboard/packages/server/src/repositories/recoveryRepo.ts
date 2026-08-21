import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  ConfirmRecoveryPendingActionBody,
  CreateRecoveryActivityBody,
  RecoveryActivity,
  RecoveryPendingAction,
  RecoverySession,
  RecoverySessionProposal,
  RecoverySessionSource,
  UpdateRecoveryActivityBody,
  UpdateRecoverySessionBody,
} from "@health-dashboard/shared";
import { toTimestampStr } from "./mappers.js";

const ACTIVITY_COLUMNS =
  "id, code, name, category, default_duration_minutes, notes, is_active, created_at, updated_at";
const SESSION_COLUMNS = `s.id, s.activity_id, a.code AS activity_code,
  a.name AS activity_name, a.category AS activity_category, s.started_at,
  s.duration_minutes, s.intensity, s.temperature_f, s.massage_type, s.notes,
  s.source, s.created_at, s.updated_at`;

export class RecoveryRepository {
  constructor(private readonly pool: Pool) {}

  async listActivities(includeInactive = false): Promise<RecoveryActivity[]> {
    const where = includeInactive ? "" : "WHERE is_active = TRUE";
    const { rows } = await this.pool.query(
      `SELECT ${ACTIVITY_COLUMNS} FROM recovery.activity ${where}
       ORDER BY is_active DESC, name`,
    );
    return rows.map(mapActivity);
  }

  async getActivity(id: number): Promise<RecoveryActivity | null> {
    const { rows } = await this.pool.query(
      `SELECT ${ACTIVITY_COLUMNS} FROM recovery.activity WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapActivity(rows[0]) : null;
  }

  async findActivity(term: string): Promise<RecoveryActivity | null> {
    const normalized = term.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const { rows } = await this.pool.query(
      `SELECT ${ACTIVITY_COLUMNS}
         FROM recovery.activity
        WHERE is_active = TRUE
          AND (LOWER(code) = $1 OR LOWER(name) = LOWER($2))
        ORDER BY CASE WHEN LOWER(code) = $1 THEN 0 ELSE 1 END
        LIMIT 1`,
      [normalized, term.trim()],
    );
    return rows[0] ? mapActivity(rows[0]) : null;
  }

  async createActivity(body: CreateRecoveryActivityBody): Promise<RecoveryActivity> {
    const { rows } = await this.pool.query(
      `INSERT INTO recovery.activity
         (code, name, category, default_duration_minutes, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${ACTIVITY_COLUMNS}`,
      [
        body.code,
        body.name,
        body.category,
        body.defaultDurationMinutes ?? null,
        body.notes ?? null,
      ],
    );
    return mapActivity(rows[0]);
  }

  async updateActivity(
    id: number,
    body: UpdateRecoveryActivityBody,
  ): Promise<RecoveryActivity | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (body.name !== undefined) add("name", body.name);
    if (body.defaultDurationMinutes !== undefined)
      add("default_duration_minutes", body.defaultDurationMinutes);
    if (body.notes !== undefined) add("notes", body.notes);
    if (body.isActive !== undefined) add("is_active", body.isActive);
    if (sets.length === 0) return this.getActivity(id);
    sets.push("updated_at = NOW()");
    values.push(id);
    const { rows } = await this.pool.query(
      `UPDATE recovery.activity SET ${sets.join(", ")}
       WHERE id = $${values.length} RETURNING ${ACTIVITY_COLUMNS}`,
      values,
    );
    return rows[0] ? mapActivity(rows[0]) : null;
  }

  archiveActivity(id: number): Promise<RecoveryActivity | null> {
    return this.updateActivity(id, { isActive: false });
  }

  async listSessions(
    start?: string,
    end?: string,
    activityId?: number,
    timezone = "UTC",
  ): Promise<RecoverySession[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (sql: (index: number) => string, value: unknown) => {
      values.push(value);
      conditions.push(sql(values.length));
    };
    if (start) {
      values.push(timezone, start);
      conditions.push(`(s.started_at AT TIME ZONE $${values.length - 1})::date >= $${values.length}::date`);
    }
    if (end) {
      values.push(timezone, end);
      conditions.push(`(s.started_at AT TIME ZONE $${values.length - 1})::date <= $${values.length}::date`);
    }
    if (activityId != null) add((i) => `s.activity_id = $${i}`, activityId);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await this.pool.query(
      `SELECT ${SESSION_COLUMNS}
         FROM recovery.session s
         JOIN recovery.activity a ON a.id = s.activity_id
         ${where}
        ORDER BY s.started_at DESC`,
      values,
    );
    return rows.map(mapSession);
  }

  async getSession(id: number, client: Pool | PoolClient = this.pool): Promise<RecoverySession | null> {
    const { rows } = await client.query(
      `SELECT ${SESSION_COLUMNS}
         FROM recovery.session s JOIN recovery.activity a ON a.id = s.activity_id
        WHERE s.id = $1`,
      [id],
    );
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async createSession(
    body: RecoverySessionProposal,
    source: RecoverySessionSource,
    client: Pool | PoolClient = this.pool,
  ): Promise<RecoverySession> {
    const { rows } = await client.query(
      `INSERT INTO recovery.session
         (activity_id, started_at, duration_minutes, intensity, temperature_f,
          massage_type, notes, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        body.activityId,
        body.startedAt,
        body.durationMinutes,
        body.intensity,
        body.temperatureF,
        body.massageType,
        body.notes,
        source,
      ],
    );
    return (await this.getSession(Number(rows[0].id), client))!;
  }

  async updateSession(
    id: number,
    body: UpdateRecoverySessionBody,
  ): Promise<RecoverySession | null> {
    const columns: Record<keyof UpdateRecoverySessionBody, string> = {
      activityId: "activity_id",
      startedAt: "started_at",
      durationMinutes: "duration_minutes",
      intensity: "intensity",
      temperatureF: "temperature_f",
      massageType: "massage_type",
      notes: "notes",
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const key of Object.keys(columns) as Array<keyof UpdateRecoverySessionBody>) {
      if (body[key] !== undefined) {
        values.push(body[key]);
        sets.push(`${columns[key]} = $${values.length}`);
      }
    }
    if (sets.length === 0) return this.getSession(id);
    sets.push("updated_at = NOW()");
    values.push(id);
    const { rowCount } = await this.pool.query(
      `UPDATE recovery.session SET ${sets.join(", ")} WHERE id = $${values.length}`,
      values,
    );
    return rowCount ? this.getSession(id) : null;
  }

  async deleteSession(id: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "DELETE FROM recovery.session WHERE id = $1",
      [id],
    );
    return (rowCount ?? 0) > 0;
  }

  async createPendingAction(input: {
    conversationId: string;
    proposal: RecoverySessionProposal;
    expiresAt: string;
  }): Promise<RecoveryPendingAction> {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      `INSERT INTO recovery.pending_action
         (id, conversation_id, payload, expires_at)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING *`,
      [id, input.conversationId, JSON.stringify(input.proposal), input.expiresAt],
    );
    return mapPendingAction(rows[0]);
  }

  async getPendingAction(id: string): Promise<RecoveryPendingAction | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM recovery.pending_action WHERE id = $1",
      [id],
    );
    return rows[0] ? mapPendingAction(rows[0]) : null;
  }

  async listPendingActions(conversationId: string): Promise<RecoveryPendingAction[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM recovery.pending_action
        WHERE conversation_id = $1 ORDER BY created_at`,
      [conversationId],
    );
    return rows.map(mapPendingAction);
  }

  async cancelPendingAction(id: string): Promise<RecoveryPendingAction | null> {
    const { rows } = await this.pool.query(
      `UPDATE recovery.pending_action
          SET status = CASE WHEN expires_at <= NOW() THEN 'expired' ELSE 'cancelled' END,
              updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id],
    );
    return rows[0] ? mapPendingAction(rows[0]) : this.getPendingAction(id);
  }

  async confirmPendingAction(
    id: string,
    proposal: RecoverySessionProposal,
    _overrides: ConfirmRecoveryPendingActionBody,
  ): Promise<{ action: RecoveryPendingAction; session: RecoverySession | null } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT * FROM recovery.pending_action WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      let action = mapPendingAction(rows[0]);
      if (action.status === "confirmed") {
        const session = action.sessionId == null ? null : await this.getSession(action.sessionId, client);
        await client.query("COMMIT");
        return { action, session };
      }
      if (action.status !== "pending" || Date.parse(action.expiresAt) <= Date.now()) {
        if (action.status === "pending") {
          const updated = await client.query(
            "UPDATE recovery.pending_action SET status = 'expired', updated_at = NOW() WHERE id = $1 RETURNING *",
            [id],
          );
          action = mapPendingAction(updated.rows[0]);
        }
        await client.query("COMMIT");
        return { action, session: null };
      }
      const session = await this.createSession(proposal, "ai_chat", client);
      const updated = await client.query(
        `UPDATE recovery.pending_action
            SET status = 'confirmed', payload = $2::jsonb, session_id = $3, updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [id, JSON.stringify(proposal), session.id],
      );
      action = mapPendingAction(updated.rows[0]);
      await client.query("COMMIT");
      return { action, session };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
function mapActivity(row: Record<string, unknown>): RecoveryActivity {
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    category: row.category as RecoveryActivity["category"],
    defaultDurationMinutes: row.default_duration_minutes == null ? null : Number(row.default_duration_minutes),
    notes: (row.notes as string | null) ?? null,
    isActive: Boolean(row.is_active),
    createdAt: toTimestampStr(row.created_at) ?? "",
    updatedAt: toTimestampStr(row.updated_at) ?? "",
  };
}

function mapSession(row: Record<string, unknown>): RecoverySession {
  return {
    id: Number(row.id),
    activityId: Number(row.activity_id),
    activityCode: String(row.activity_code),
    activityName: String(row.activity_name),
    activityCategory: row.activity_category as RecoverySession["activityCategory"],
    startedAt: toTimestampStr(row.started_at) ?? "",
    durationMinutes: Number(row.duration_minutes),
    intensity: row.intensity == null ? null : Number(row.intensity),
    temperatureF: row.temperature_f == null ? null : Number(row.temperature_f),
    massageType: (row.massage_type as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    source: row.source as RecoverySessionSource,
    createdAt: toTimestampStr(row.created_at) ?? "",
    updatedAt: toTimestampStr(row.updated_at) ?? "",
  };
}

function mapPendingAction(row: Record<string, unknown>): RecoveryPendingAction {
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    status: row.status as RecoveryPendingAction["status"],
    proposal: payload as RecoverySessionProposal,
    sessionId: row.session_id == null ? null : Number(row.session_id),
    expiresAt: toTimestampStr(row.expires_at) ?? "",
    createdAt: toTimestampStr(row.created_at) ?? "",
    updatedAt: toTimestampStr(row.updated_at) ?? "",
  };
}
