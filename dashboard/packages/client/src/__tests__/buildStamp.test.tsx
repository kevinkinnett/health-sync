import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BuildInfo } from "@health-dashboard/shared";
import { BuildStamp } from "../components/BuildStamp";
import { buildsAgree, formatBuild, isBuildInfo } from "../buildInfo";

const apiFetchMock = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (path?: string) => apiFetchMock(path),
}));

function build(over: Partial<BuildInfo> = {}): BuildInfo {
  return {
    commit: "a1b2c3d4e5f6a7b8c9d0",
    shortCommit: "a1b2c3d",
    builtAt: "2026-08-01T12:00:00.000Z",
    version: "0.1.0",
    buildNumber: "42",
    source: "ci",
    ...over,
  };
}

function renderStamp(client = build()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <BuildStamp client={client} />
    </QueryClientProvider>,
  );
}

describe("formatBuild", () => {
  it("shows the version, the commit and the CI run", () => {
    expect(formatBuild(build())).toBe("v0.1.0 · a1b2c3d · #42");
  });

  it("omits the run number on a local build", () => {
    expect(formatBuild(build({ buildNumber: "", source: "local" }))).toBe(
      "v0.1.0 · a1b2c3d",
    );
  });

  it("keeps the run number, which a re-run changes but the SHA does not", () => {
    // Same commit, second CI run: the only thing distinguishing the two
    // images is this number.
    expect(formatBuild(build({ buildNumber: "43" }))).toContain("#43");
  });

  it("drops the meaningless 0.0.0 version and shows the commit alone", () => {
    // The client package is private and versioned 0.0.0, so "v0.0.0" is
    // noise beside the only identifier that distinguishes builds. Found by
    // probing the real bundle, which printed exactly that.
    expect(formatBuild(build({ version: "0.0.0" }))).toBe("a1b2c3d · #42");
  });

  it("never renders an empty stamp", () => {
    expect(
      formatBuild(
        build({ version: "0.0.0", shortCommit: "unknown", commit: "unknown", buildNumber: "" }),
      ),
    ).toBe("build unknown");
  });

  it("drops the commit when git wasn't available at build time", () => {
    // A container built from a tarball has no .git. "v0.1.0 · unknown"
    // reads like a bug; "v0.1.0" reads like a fact.
    expect(
      formatBuild(build({ shortCommit: "unknown", commit: "unknown", buildNumber: "" })),
    ).toBe("v0.1.0");
  });
});

describe("buildsAgree", () => {
  it("is true when both sides came from the same commit", () => {
    expect(buildsAgree(build(), build())).toBe(true);
  });

  it("is false when they differ", () => {
    expect(buildsAgree(build(), build({ commit: "ffffffff", shortCommit: "fffffff" }))).toBe(
      false,
    );
  });

  it("does NOT cry mismatch when either side is unknown", () => {
    // Otherwise a build without git would warn forever, and a warning
    // that is always on is one nobody reads.
    expect(buildsAgree(build({ commit: "unknown" }), build())).toBe(true);
    expect(buildsAgree(build(), build({ commit: "unknown" }))).toBe(true);
  });
});

describe("isBuildInfo", () => {
  it("accepts a well-formed payload", () => {
    expect(isBuildInfo(build())).toBe(true);
  });

  it("rejects the things an older server actually returns", () => {
    // No /api/version route means the response can be [], an HTML error
    // page, or a 404 body — all of which reach the component as *something*
    // and previously produced "API on  — reload to catch up" with a blank
    // commit: a warning that alarms without informing.
    for (const junk of [[], null, undefined, "<!doctype html>", {}, { commit: "" }]) {
      expect(isBuildInfo(junk), String(junk)).toBe(false);
    }
  });
});

describe("BuildStamp", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("always shows the client build, even before the server answers", () => {
    // The client build is the one you cannot discover any other way — a
    // service worker can serve last week's bundle indefinitely. It must
    // render immediately, not wait on a round trip.
    apiFetchMock.mockResolvedValue(build());
    renderStamp();
    expect(screen.getByTestId("build-stamp")).toHaveTextContent("v0.1.0 · a1b2c3d");
  });

  it("flags a build that did not come from CI", () => {
    // "local" on a production deployment means the artefact was built on
    // someone's machine — never tested by CI, not reproducible.
    renderStamp(build({ source: "local", buildNumber: "" }));
    expect(screen.getByTestId("build-local")).toBeInTheDocument();
  });

  it("does not flag a CI build", () => {
    renderStamp(build());
    expect(screen.queryByTestId("build-local")).not.toBeInTheDocument();
  });

  it("warns when the API is on a different commit", async () => {
    apiFetchMock.mockResolvedValue(
      build({ commit: "deadbeefdeadbeef", shortCommit: "deadbee" }),
    );
    renderStamp();
    await waitFor(() =>
      expect(screen.getByTestId("build-mismatch")).toHaveTextContent("deadbee"),
    );
  });

  it("stays quiet when the two agree", async () => {
    apiFetchMock.mockResolvedValue(build());
    renderStamp(build());
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith("/version"));
    expect(screen.queryByTestId("build-mismatch")).not.toBeInTheDocument();
  });

  it("does not warn when the API answers with something that isn't a build", () => {
    // The exact case the real bundle hit: an unstubbed /api/version.
    apiFetchMock.mockResolvedValue([]);
    renderStamp();
    expect(screen.queryByTestId("build-mismatch")).not.toBeInTheDocument();
  });

  it("does not warn when the server cannot identify itself", () => {
    // A server built without git reports commit "unknown". That is "cannot
    // tell", not "mismatch" — a warning that is always on is one nobody
    // reads. (The unreachable-endpoint case renders identically to the
    // not-yet-answered case above, which is why there is no separate test
    // for it: react-query holds no data in either.)
    apiFetchMock.mockResolvedValue(build({ commit: "unknown", shortCommit: "unknown" }));
    renderStamp();
    expect(screen.queryByTestId("build-mismatch")).not.toBeInTheDocument();
  });
});
