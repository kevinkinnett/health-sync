/**
 * Static extraction of the table/column contract a repository depends on.
 *
 * Motivation: every repository's SQL is a hard dependency on the database
 * schema that nothing verifies. The controller/service tests use fake
 * repos, and even `insightRepo.test.ts` — which exists *because* a real
 * production 500 slipped through — drives the repo against a fake pool,
 * so it validates the row MAPPER but never the SQL. A misspelled column
 * passes typecheck and every test, then 500s in production.
 *
 * This module extracts the identifiers a SQL string references so a test
 * can assert them against a snapshot of the real schema, offline (CI has
 * no database).
 *
 * Design bias: FALSE NEGATIVES OVER FALSE POSITIVES. Anything that isn't
 * unambiguously a bare column reference is skipped. A test that cries
 * wolf gets disabled; one that quietly catches the `saturated_fatt` class
 * of typo earns its keep.
 */

export type SchemaFixture = Record<string, string[]>;

/** Bare words that can appear in a select list without being columns. */
const NON_COLUMNS = new Set([
  "distinct",
  "null",
  "true",
  "false",
  "case",
  "when",
  "then",
  "else",
  "end",
  "as",
  "and",
  "or",
  "not",
  "asc",
  "desc",
  "on",
  "using",
  "is",
  "in",
]);

/** `FROM|JOIN|INTO|UPDATE <schema>.<table>` — the tables a file touches. */
export function extractTableRefs(sql: string): string[] {
  const out = new Set<string>();
  const re = /\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_][a-z_0-9]*\.[a-z_0-9]+)/gi;
  for (const m of sql.matchAll(re)) out.add(m[1].toLowerCase());
  return [...out];
}

/** Aliases introduced with `AS foo` are legal bare words that aren't columns. */
function aliasNames(sql: string): Set<string> {
  const out = new Set<string>();
  for (const m of sql.matchAll(/\bAS\s+"?([a-z_][a-z_0-9]*)"?/gi)) {
    out.add(m[1].toLowerCase());
  }
  return out;
}

/** Split a select list on commas that are not inside parentheses. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Column identifiers we are confident about: bare `col` or `alias.col`
 * entries in a SELECT list, and the column list of an INSERT.
 *
 * Deliberately skipped: expressions (anything with parens/operators),
 * `*`, quoted identifiers, casts, literals and anything introduced as an
 * alias in the same file.
 */
export function extractColumnRefs(sql: string): string[] {
  const aliases = aliasNames(sql);
  const found = new Set<string>();

  const consider = (raw: string): void => {
    let tok = raw.trim();
    if (!tok) return;
    // Drop a trailing alias ("col AS foo" / "col foo") — keep the head.
    tok = tok.split(/\s+/)[0];
    // `table.column` / `t.column` → column
    if (tok.includes(".")) tok = tok.slice(tok.lastIndexOf(".") + 1);
    if (!/^[a-z_][a-z_0-9]*$/.test(tok)) return; // expressions, *, $1, casts
    const lower = tok.toLowerCase();
    if (NON_COLUMNS.has(lower) || aliases.has(lower)) return;
    found.add(lower);
  };

  // SELECT <list> FROM
  for (const m of sql.matchAll(/\bSELECT\s+([\s\S]*?)\s+FROM\s/gi)) {
    let list = m[1];
    if (list.includes("*")) continue; // SELECT * — nothing to check
    list = list.replace(/^\s*DISTINCT\s+/i, "");
    for (const item of splitTopLevel(list)) consider(item);
  }

  // INSERT INTO <table> (<cols>)
  for (const m of sql.matchAll(
    /\bINSERT\s+INTO\s+[a-z_][a-z_0-9]*\.[a-z_0-9]+\s*\(([^)]*)\)/gi,
  )) {
    for (const item of splitTopLevel(m[1])) consider(item);
  }

  return [...found];
}

/** Union of the columns of every referenced table. */
export function allowedColumns(
  tables: string[],
  schema: SchemaFixture,
): Set<string> {
  const out = new Set<string>();
  for (const t of tables) {
    for (const c of schema[t] ?? []) out.add(c.toLowerCase());
  }
  return out;
}
