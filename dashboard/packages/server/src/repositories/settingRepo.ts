import type { Pool } from "pg";

/**
 * Generic key → JSON settings store (`universe.app_setting`). One row per
 * logical settings group (e.g. "notifications"). The value is opaque
 * JSONB; all typing, defaults and validation live in the service layer
 * so a partial or legacy stored shape can be merged forward safely.
 *
 * This is the app's first server-backed settings surface — future
 * preference groups become additional keys here rather than new tables.
 */
export class SettingRepository {
  constructor(private pool: Pool) {}

  /** The stored JSON value for `key`, or null if unset. */
  async get<T = unknown>(key: string): Promise<T | null> {
    const { rows } = await this.pool.query(
      `SELECT value FROM universe.app_setting WHERE key = $1`,
      [key],
    );
    return rows.length ? (rows[0].value as T) : null;
  }

  /** Upsert the JSON value for `key`. */
  async set(key: string, value: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO universe.app_setting (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, JSON.stringify(value)],
    );
  }
}
