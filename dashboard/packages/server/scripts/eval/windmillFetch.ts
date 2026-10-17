/**
 * Runs recorded repository queries against production through a Windmill
 * python3 preview, read-only, and returns the result sets.
 *
 * Why Windmill: this machine has no route to the database, but Windmill
 * holds the `u/kevin/universe_db` resource and its REST API is reachable
 * with the repo `.env` token. The connection is opened with
 * `read_only = True`, so even a mis-recorded write would be refused by
 * Postgres itself (and `SnapshotPool` refuses writes before that).
 *
 * Values are encoded so `SnapshotPool` can decode them the way `pg` would:
 * numeric and int8 as strings, dates and timestamps as ISO strings.
 */
import type { SnapshotQuery, SnapshotResult } from "../../src/services/evaluation/snapshotPool.js";

const PYTHON = String.raw`
import json, re, datetime, decimal
import psycopg
import wmill

def main(queries: list):
    res = wmill.get_resource("u/kevin/universe_db")
    conn = psycopg.connect(
        host=res["host"], port=int(res.get("port", 5432)), user=res["user"],
        password=res["password"], dbname=res["dbname"],
        sslmode=res.get("sslmode", "disable"),
    )
    conn.read_only = True
    out = {}
    with conn:
        for q in queries:
            sql = q["sql"].replace("%", "%%")
            sql = re.sub(r"\$(\d+)", lambda m: "%(p" + m.group(1) + ")s", sql)
            params = {"p" + str(i + 1): v for i, v in enumerate(q["params"])}
            with conn.cursor() as cur:
                cur.execute(sql, params)
                cols = [{"name": d.name, "oid": d.type_code} for d in cur.description]
                rows = []
                for row in cur.fetchall():
                    enc = []
                    for v, c in zip(row, cols):
                        if isinstance(v, decimal.Decimal):
                            v = str(v)
                        elif isinstance(v, (datetime.datetime, datetime.date)):
                            v = v.isoformat()
                        elif isinstance(v, int) and not isinstance(v, bool) and c["oid"] == 20:
                            v = str(v)
                        enc.append(v)
                    rows.append(enc)
                out[q["key"]] = {"columns": cols, "rows": rows}
    return out
`;

export async function fetchViaWindmill(queries: SnapshotQuery[]): Promise<Record<string, SnapshotResult>> {
  const base = process.env.WINDMILL_BASE_URL;
  const token = process.env.WINDMILL_TOKEN;
  const workspace = process.env.WINDMILL_WORKSPACE;
  if (!base || !token || !workspace) {
    throw new Error("WINDMILL_BASE_URL / WINDMILL_TOKEN / WINDMILL_WORKSPACE must be set (source the dashboard .env)");
  }
  const out: Record<string, SnapshotResult> = {};
  // Small batches keep each preview well under Windmill's sync-wait cutoff.
  for (let i = 0; i < queries.length; i += 8) {
    const batch = queries.slice(i, i + 8);
    const response = await fetch(`${base}/api/w/${workspace}/jobs/run_wait_result/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: PYTHON, language: "python3", args: { queries: batch } }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Windmill preview failed (${response.status}): ${text.slice(0, 500)}`);
    Object.assign(out, JSON.parse(text) as Record<string, SnapshotResult>);
  }
  return out;
}
