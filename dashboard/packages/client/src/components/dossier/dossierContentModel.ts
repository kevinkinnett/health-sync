export type DossierBodySegment =
  | { kind: "text"; value: string }
  | { kind: "citations"; ids: number[]; raw: string };

const CITATION_GROUP_RE = /\[([\d,\s]+)\]/g;

/** Parses only the citation syntax requested from the LLM; all else is text. */
export function parseDossierBody(body: string): DossierBodySegment[] {
  const segments: DossierBodySegment[] = [];
  let cursor = 0;

  for (const match of body.matchAll(CITATION_GROUP_RE)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ kind: "text", value: body.slice(cursor, index) });
    }

    const ids = match[1]
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    if (ids.length > 0) {
      segments.push({ kind: "citations", ids, raw: match[0] });
    } else {
      segments.push({ kind: "text", value: match[0] });
    }
    cursor = index + match[0].length;
  }

  if (cursor < body.length) {
    segments.push({ kind: "text", value: body.slice(cursor) });
  }
  return segments;
}

export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
