import type { BuildInfo } from "@health-dashboard/shared";

/**
 * The commit THIS bundle was built from, baked in by vite at build time
 * (see `define` in vite.config.ts).
 *
 * Deliberately not fetched: the whole point is to identify the JavaScript
 * currently executing in the browser, which a network call cannot do. A
 * service worker can serve a bundle from last week while every request it
 * makes reaches today's server.
 */
declare const __BUILD_INFO__: BuildInfo | undefined;

/**
 * Vitest does not run through vite's `define`, so the constant is absent
 * under test. Falling back keeps every component that displays a version
 * renderable in jsdom instead of throwing a ReferenceError.
 */
export const CLIENT_BUILD: BuildInfo =
  typeof __BUILD_INFO__ !== "undefined"
    ? __BUILD_INFO__
    : { commit: "unknown", shortCommit: "unknown", builtAt: "", version: "0.0.0" };

/**
 * `v0.1.0 · a1b2c3d`, degrading to whichever half is meaningful.
 *
 * The client package is versioned `0.0.0` — it is a private app, not a
 * published library — so printing "v0.0.0" is pure noise beside the one
 * identifier that actually distinguishes builds. Same in reverse when git
 * was unavailable: "· unknown" reads as a bug rather than a fact.
 */
export function formatBuild(info: BuildInfo): string {
  const version = info.version && info.version !== "0.0.0" ? `v${info.version}` : "";
  const commit = info.shortCommit && info.shortCommit !== "unknown" ? info.shortCommit : "";
  return [version, commit].filter(Boolean).join(" · ") || "build unknown";
}

/**
 * Whether a payload is actually a BuildInfo.
 *
 * An older server has no `/api/version`, and depending on the proxy in
 * front of it a request can come back as an HTML error page, `[]`, or a
 * 404 body — all of which reach here as *something*. Without this check
 * the comparison below sees `undefined !== <sha>` and reports a mismatch,
 * rendering "API on — reload to catch up" with a blank commit: a warning
 * that alarms without informing. Caught by probing the real bundle, where
 * the stub returns `[]`.
 */
export function isBuildInfo(value: unknown): value is BuildInfo {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as BuildInfo).commit === "string" &&
    (value as BuildInfo).commit.length > 0 &&
    typeof (value as BuildInfo).shortCommit === "string"
  );
}

/**
 * Whether the running bundle and the API it is talking to came from the
 * same commit.
 *
 * Unknown on either side means "cannot tell", which must NOT be reported
 * as a mismatch — a build without git would otherwise cry wolf forever.
 */
export function buildsAgree(client: BuildInfo, server: BuildInfo): boolean {
  if (client.commit === "unknown" || server.commit === "unknown") return true;
  return client.commit === server.commit;
}
