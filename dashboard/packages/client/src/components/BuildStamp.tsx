import type { BuildInfo } from "@health-dashboard/shared";
import { useServerVersion } from "../api/queries";
import { CLIENT_BUILD, buildsAgree, formatBuild, isBuildInfo } from "../buildInfo";
import { STATUS } from "./charts/chartPalette";

/**
 * What you are actually running, in the corner of every page.
 *
 * The question this answers is "did my deploy land?", and the reason it
 * needs answering in the UI rather than in a terminal is that the client
 * is a PWA: its bundle is precached by a service worker, so a browser can
 * keep serving a previous build long after the deploy succeeded. Several
 * rounds of debugging in this project compared observations taken against
 * different versions without anyone realising.
 *
 * Shows the CLIENT build, because that is the one you cannot otherwise
 * find out — and calls out a server mismatch, which is the case where a
 * screen and its data disagree about what is possible.
 */
export function BuildStamp({
  /*
   * Injected rather than read straight from the module so the mismatch
   * state is reachable in a test. Vitest does not run through vite's
   * `define`, so the real constant is always "unknown" under jsdom — and
   * `buildsAgree` treats unknown as "cannot tell", which would make the
   * warning permanently untestable.
   */
  client = CLIENT_BUILD,
}: { client?: BuildInfo } = {}) {
  const server = useServerVersion();
  // Only compare against something that IS a BuildInfo: an older server
  // (or a proxy error page) can answer with anything at all.
  const serverBuild = isBuildInfo(server.data) ? server.data : null;
  const mismatch = serverBuild != null && !buildsAgree(client, serverBuild);

  return (
    <div className="px-3 py-2 text-[10px] leading-tight" data-testid="build-stamp">
      <div
        className="text-outline tabular-nums"
        title={
          client.builtAt
            ? `App built ${client.builtAt}`
            : "Build time unknown"
        }
      >
        {formatBuild(client)}
      </div>

      {mismatch && (
        <div
          className="mt-1 flex items-start gap-1.5"
          data-testid="build-mismatch"
          /* A tooltip alone would hide the one state worth noticing. */
          title={`Server is on ${serverBuild!.commit}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0 mt-1"
            style={{ backgroundColor: STATUS.warning }}
          />
          <span className="text-on-surface-variant">
            API on {serverBuild!.shortCommit} — reload to catch up
          </span>
        </div>
      )}
    </div>
  );
}
