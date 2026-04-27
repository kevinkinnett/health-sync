export interface Config {
  port: number;
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
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT ?? "3001", 10),
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
        process.env.LLM_API_URL ?? "https://claude-code.tail322ce1.ts.net/v1"
      ).replace(/\/+$/, ""),
      apiKey: requireEnv("LLM_API_KEY"),
      dossierModel: process.env.LLM_MODEL_DOSSIER ?? "qwen3-max-2026-01-23",
    },
  };
}
