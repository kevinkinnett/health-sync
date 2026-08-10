import type { BuildInfo } from "@health-dashboard/shared";
import type { ReactNode } from "react";
import { useServerVersion } from "../api/queries";
import { CLIENT_BUILD, buildsAgree, formatBuild, isBuildInfo } from "../buildInfo";
import { activateUpdateAndReload } from "../lib/appUpdate";

/**
 * Prevent a cached client from interpreting a newer API contract. During a
 * rolling deployment the navigation remains usable, but route content is held
 * until both halves of the application identify the same commit.
 */
export function BuildCompatibilityGate({
  children,
  client = CLIENT_BUILD,
  update = activateUpdateAndReload,
}: {
  children: ReactNode;
  client?: BuildInfo;
  update?: () => Promise<void> | void;
}) {
  const server = useServerVersion();
  const serverBuild = isBuildInfo(server.data) ? server.data : null;
  const mismatch = serverBuild != null && !buildsAgree(client, serverBuild);

  if (!mismatch) return children;

  return (
    <section
      role="alert"
      data-testid="build-compatibility-gate"
      className="mx-auto mt-12 max-w-xl rounded-3xl border border-outline-variant/20 bg-surface-container-low p-8 text-center shadow-sm"
    >
      <span className="material-symbols-outlined text-4xl text-primary" aria-hidden="true">
        system_update
      </span>
      <h1 className="mt-3 text-xl font-bold text-on-surface">A new version is ready</h1>
      <p className="mt-2 text-sm leading-6 text-on-surface-variant">
        This tab is running {formatBuild(client)}, while the API is running {formatBuild(serverBuild)}.
        Update before continuing so health data is interpreted by the matching app.
      </p>
      <button
        type="button"
        onClick={() => void update()}
        className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary-fixed transition-opacity hover:opacity-90"
      >
        Update and reload
      </button>
    </section>
  );
}
