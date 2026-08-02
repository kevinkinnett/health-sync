/**
 * What is actually running.
 *
 * Exists because "have you deployed?" turned out to be unanswerable. The
 * client is a PWA whose bundle is precached by a service worker, and the
 * server is deployed separately — so a browser can be running last week's
 * JavaScript against today's API and nothing on screen says so. Several
 * rounds of debugging in this project were spent comparing observations
 * taken against different versions without knowing it.
 *
 * `commit` is the full SHA and `shortCommit` the 7-char form for display.
 * Both are `"unknown"` rather than absent when git isn't reachable at
 * build time (a container built from a tarball, say) — a missing field
 * would force every consumer to handle undefined for a case that is not
 * worth branching on.
 */
export interface BuildInfo {
  /** Full git SHA of the commit this was built from. */
  commit: string;
  /** First 7 characters, for display. */
  shortCommit: string;
  /** ISO-8601 instant the build ran. */
  builtAt: string;
  /** Package version, e.g. "0.1.0". */
  version: string;
  /**
   * CI run number, e.g. "42". Empty when the build did not come from CI.
   *
   * Distinct from the commit on purpose: a re-run of the same commit
   * produces a new build number, which is what tells you whether the
   * image you are looking at is the one CI just pushed or an earlier
   * attempt at the same code.
   */
  buildNumber: string;
  /**
   * Where the build came from.
   *
   * `local` on a production deployment means someone shipped from a
   * laptop — the artefact was never tested by CI and cannot be rebuilt
   * from a known pipeline run. Worth being able to see at a glance.
   */
  source: "ci" | "local";
}
