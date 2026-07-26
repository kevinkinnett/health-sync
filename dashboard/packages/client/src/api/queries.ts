/**
 * Barrel for the React Query hooks.
 *
 * The hooks used to live here in one ~1075-line file. They are now split
 * by domain under `./queries/`, but this barrel keeps the old
 * `from "../api/queries"` import path working everywhere, so components
 * can migrate to narrow imports gradually (or never — the barrel is a
 * legitimate public surface).
 *
 * Adding a hook: put it in the matching domain file, not here.
 */
export * from "./queries/config.js";
export * from "./queries/health.js";
export * from "./queries/ingest.js";
export * from "./queries/alerts.js";
export * from "./queries/settings.js";
export * from "./queries/supplements.js";
export * from "./queries/medications.js";
export * from "./queries/dossier.js";
export * from "./queries/analytics.js";
export * from "./queries/insights.js";
export * from "./queries/interventions.js";
export * from "./queries/apiConsole.js";
