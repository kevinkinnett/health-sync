import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import type { BuildInfo } from "@health-dashboard/shared";

/**
 * The commit this API process is running.
 *
 * Env first, git second. In a container there is usually no `.git` but the
 * image build can pass `GIT_COMMIT`; running from a checkout has git but
 * no env. Supporting both means the endpoint answers honestly under either
 * deployment shape instead of only the one in use today.
 *
 * Resolved ONCE at module load. A running process cannot change the code
 * it is executing, so re-shelling out per request would spend a process
 * fork to re-learn a constant.
 */
function resolve(): BuildInfo {
  const commit =
    process.env.GIT_COMMIT?.trim() ||
    gitSha() ||
    "unknown";

  let version = "0.0.0";
  try {
    const require = createRequire(import.meta.url);
    version = (require("../package.json") as { version?: string }).version ?? version;
  } catch {
    /* keep the default */
  }

  // In the production image there is no .git, so these env vars — baked in
  // by the Dockerfile from CI build args — are the only source of truth.
  const buildNumber = process.env.BUILD_NUMBER?.trim() ?? "";

  return {
    commit,
    shortCommit: commit.slice(0, 7),
    // Falling back to "now" is right for a dev process but WRONG for an
    // image: a container restart would report a fresh build time for
    // months-old code. BUILD_TIME is baked at image build for that reason.
    builtAt: process.env.BUILD_TIME?.trim() || new Date().toISOString(),
    version,
    buildNumber,
    source: buildNumber ? "ci" : "local",
  };
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      // Never let a git prompt or a slow filesystem hang server startup.
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export const SERVER_BUILD: BuildInfo = resolve();
