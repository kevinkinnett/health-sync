/** Convert a pg Date value to ISO date string (YYYY-MM-DD) */
export function toDateStr(val: unknown): string {
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val);
  // pg may return dates as full timestamp strings — extract YYYY-MM-DD
  const match = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  // Try parsing as Date
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

/** Convert a pg timestamp value to ISO string */
export function toTimestampStr(val: unknown): string | null {
  if (val == null) return null;
  if (val instanceof Date) return val.toISOString();
  const s = String(val);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  return s;
}
