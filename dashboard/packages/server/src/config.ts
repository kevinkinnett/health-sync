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
  };
}
