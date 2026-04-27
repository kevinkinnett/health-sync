/**
 * Cached "dossier" we build for each supplement / medication item by
 * asking an LLM (via the local Claude proxy) to research it on the open
 * web. One row per (item_type, item_id); regenerated on demand.
 */

export type DossierItemType = "supplement" | "medication";

/** Stable section keys. The UI orders sections by this enum. */
export type DossierSectionKey =
  | "summary"
  | "activeIngredients"
  | "mechanism"
  | "indications"
  | "dosing"
  | "sideEffects"
  | "interactions"
  | "brandNotes"
  | "quality";

/** A reference cited by one or more sections. `id` is 1-based and unique within a dossier. */
export interface DossierSource {
  id: number;
  title: string;
  url: string;
  /** Publisher / domain hint, e.g. "NIH ODS", "DailyMed", "Now Foods". */
  publisher?: string;
}

export interface DossierSection {
  key: DossierSectionKey;
  /** Human-readable heading (LLM may localize / phrase differently per item). */
  heading: string;
  /** Plain text with `[N]` references that map to `sources[].id`. Newline-separated paragraphs. */
  body: string;
  /** Sources referenced by this section. */
  sourceIds: number[];
}

export interface DossierContent {
  /** Schema version so we can migrate stored content later. */
  version: 1;
  /** One-line tagline shown at the top of the drawer. */
  headline: string;
  /** Mandatory non-medical-advice disclaimer. */
  disclaimer: string;
  sections: DossierSection[];
  sources: DossierSource[];
}

export interface DossierEntry {
  itemType: DossierItemType;
  itemId: number;
  /** Snapshot of the item as it was when we built this dossier. */
  itemName: string;
  itemBrand: string | null;
  itemForm: string | null;
  content: DossierContent;
  /** Provenance — which model the proxy actually invoked. */
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  fetchedAt: string;
}
