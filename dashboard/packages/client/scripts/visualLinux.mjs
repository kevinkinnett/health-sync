/**
 * Runs the visual suite on Linux, in the same pinned Playwright image CI
 * uses, so the `*-chromium-linux.png` baselines can be checked and
 * re-recorded from a Windows or macOS machine.
 *
 *   pnpm e2e:visual:linux             check against the Linux baselines
 *   pnpm e2e:visual:linux --update    re-record them (then eyeball the diff)
 *
 * Why a container rather than "whatever Linux": text and curve
 * anti-aliasing depend on the exact Chromium build and system libraries,
 * and the suite's tolerance is deliberately tight (playwright.config.ts).
 * The CI job runs inside this exact image, so a baseline recorded here is
 * byte-for-byte what CI renders. Keep the tag in step with
 * @playwright/test and with .github/workflows/docker.yml.
 *
 * Needs docker or podman. The checkout is copied in read-only (the host's
 * node_modules hold Windows/macOS binaries and are excluded); only the
 * snapshot folder is mounted writable.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

export const PLAYWRIGHT_IMAGE = "mcr.microsoft.com/playwright:v1.61.1-noble";

const CLIENT = resolve(import.meta.dirname, "..");
const DASHBOARD = resolve(CLIENT, "../..");
const SNAPSHOTS = join(CLIENT, "e2e/visual.spec.ts-snapshots");
const update = process.argv.includes("--update");

const engine = ["docker", "podman"].find(
  (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0,
);
if (!engine) {
  console.error("Needs docker or podman on PATH.");
  process.exit(1);
}

const inner = [
  "set -e",
  "mkdir -p /work",
  "cd /src && tar --exclude=node_modules --exclude=dist --exclude=test-results --exclude=playwright-report -cf - . | tar -xf - -C /work",
  "rm -rf /work/packages/client/e2e/visual.spec.ts-snapshots",
  "ln -s /snapshots /work/packages/client/e2e/visual.spec.ts-snapshots",
  "cd /work && corepack enable && pnpm install --frozen-lockfile --reporter=silent",
  `cd /work/packages/client && pnpm exec playwright test e2e/visual.spec.ts${update ? " --update-snapshots" : ""}`,
].join(" && ");

execFileSync(
  engine,
  [
    "run", "--rm", "--ipc=host",
    "-e", "COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
    "-v", `${DASHBOARD}:/src:ro`,
    "-v", `${SNAPSHOTS}:/snapshots`,
    PLAYWRIGHT_IMAGE,
    "bash", "-c", inner,
  ],
  { stdio: "inherit" },
);
