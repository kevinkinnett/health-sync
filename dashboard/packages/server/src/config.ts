export interface Config {
  port: number;
  /**
   * IANA timezone name (e.g. `America/New_York`) representing the *user's*
   * local zone. Used everywhere we bucket TIMESTAMPTZ values into calendar
   * days — adherence calendars, lag correlations, default date ranges, etc.
   *
   * Always an IANA name (never a fixed `±HH:MM` offset) so DST transitions
   * are handled automatically by both Postgres `AT TIME ZONE` and JS
   * `Intl.DateTimeFormat`. Validated at boot by `assertValidTimezone`.
   */
  userTimezone: string;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: boolean;
  };
  windmill: {
    baseUrl: string;
    token: string;
    workspace: string;
  };
  llm: {
    /** Base URL for the OpenAI-compatible proxy (no trailing slash). */
    baseUrl: string;
    apiKey: string;
    /** Model name to request from the proxy for dossier generation. */
    dossierModel: string;
    /** Model used for the multi-category Insights agentic loop. */
    insightsModel: string;
    /** Model used for the open-ended Chat surface. */
    chatModel: string;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Throws if `tz` is not a valid IANA timezone identifier. We probe via
 * `Intl.DateTimeFormat` because the constructor rejects unknown zones — that
 * gives us a check that works in any modern Node without needing the (newer)
 * `Intl.supportedValuesOf("timeZone")` API.
 */
function assertValidTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
  } catch {
    throw new Error(
      `Invalid USER_TIMEZONE: "${tz}". Expected an IANA name like "America/New_York".`,
    );
  }
}

export function loadConfig(): Config {
  const userTimezone = process.env.USER_TIMEZONE ?? "America/New_York";
  assertValidTimezone(userTimezone);

  return {
    port: parseInt(process.env.PORT ?? "3001", 10),
    userTimezone,
    db: {
      host: requireEnv("DB_HOST"),
      port: parseInt(process.env.DB_PORT ?? "5432", 10),
      user: requireEnv("DB_USER"),
      password: requireEnv("DB_PASSWORD"),
      database: requireEnv("DB_NAME"),
      ssl: process.env.DB_SSL === "true",
    },
    windmill: {
      baseUrl: requireEnv("WINDMILL_BASE_URL"),
      token: requireEnv("WINDMILL_TOKEN"),
      workspace: process.env.WINDMILL_WORKSPACE ?? "claw",
    },
    llm: {
      baseUrl: (
        // OpenAI-compatible Claude proxy on the Tailnet (:4000/v1 →
        // container 127.0.0.1:4000; an Anthropic-compatible twin lives on
        // :4003). Both are backed by the Claude Agent SDK and bill against
        // the Claude Code OAuth / Max subscription, so no API key is needed.
        process.env.LLM_API_URL ??
        "https://claude-code.tail322ce1.ts.net:4000/v1"
      ).replace(/\/+$/, ""),
      // Optional — the proxy doesn't enforce auth. Leave empty (or any
      // string); the Agent SDK authenticates via the Claude subscription.
      apiKey: process.env.LLM_API_KEY ?? "",
      // The proxy requires a CLAUDE model — aliases (opus/sonnet/haiku) or
      // full ids (claude-opus-4-7, claude-sonnet-4-6, …). The old qwen
      // shim names are now rejected. Sonnet is the tested default for the
      // tool-calling insight/dossier/chat loops; bump to opus per-task via
      // env for max quality (flat-rate subscription, just slower).
      dossierModel: process.env.LLM_MODEL_DOSSIER ?? "sonnet",
      insightsModel: process.env.LLM_MODEL_INSIGHTS ?? "sonnet",
      chatModel: process.env.LLM_MODEL_CHAT ?? "sonnet",
    },
  };
}
