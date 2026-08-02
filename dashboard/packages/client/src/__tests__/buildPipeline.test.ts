import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the chain that carries a build's identity from CI into the app.
 *
 * Every link is a place where the stamp fails SILENTLY — the build
 * succeeds, the image ships, and the only symptom is a version reading
 * "unknown" long after anyone would connect it to a config file. That is
 * not hypothetical: the first deployment of this feature did exactly
 * that, and the cause was turbo, which sanitizes the environment for
 * tasks and had never been told these variables exist. The server was
 * unaffected (it reads env at runtime and never goes through turbo), so
 * the API reported the right commit while the bundle reported none —
 * which reads as a permanent mismatch warning.
 *
 * These are file-content assertions, deliberately. There is no runtime to
 * exercise: by the time anything executes, the damage is a missing string
 * in a bundle nobody is looking at.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

const VARS = ["GIT_COMMIT", "BUILD_TIME", "BUILD_NUMBER"] as const;

describe("build identity pipeline", () => {
  it("turbo passes the build vars through to tasks", () => {
    // Without this, vite cannot see them and bakes "unknown" into the
    // bundle while the build reports success.
    const turbo = JSON.parse(read("turbo.json")) as {
      tasks: { build: { env?: string[] } };
    };
    for (const v of VARS) {
      expect(turbo.tasks.build.env ?? [], `turbo.json build.env must list ${v}`).toContain(v);
    }
  });

  it("the Dockerfile declares them in BOTH stages", () => {
    // ARGs do not cross stages. The build stage needs them so vite can
    // bake the client's identity; the runtime stage needs them as ENV
    // because the server resolves its own at process start.
    const dockerfile = read("Dockerfile");
    const stages = dockerfile.split(/^FROM /m).filter((s) => s.trim());
    expect(stages.length).toBeGreaterThanOrEqual(2);
    for (const stage of stages) {
      for (const v of VARS) {
        expect(stage, `every stage must declare ARG ${v}`).toContain(`ARG ${v}`);
      }
    }
  });

  it("CI supplies all three to the image build", () => {
    const workflow = read("..", ".github", "workflows", "docker.yml");
    for (const v of VARS) {
      expect(workflow, `workflow must pass ${v} as a build-arg`).toMatch(
        new RegExp(`${v}=\\$\\{\\{`),
      );
    }
  });

  it("vite reads every var CI is told to send", () => {
    // A var passed by CI but never read is a silent no-op.
    const config = read("packages", "client", "vite.config.ts");
    for (const v of VARS) {
      expect(config, `vite.config.ts must read ${v}`).toContain(`process.env.${v}`);
    }
  });

  it("the server reads them too", () => {
    const buildInfo = read("packages", "server", "src", "buildInfo.ts");
    for (const v of VARS) {
      expect(buildInfo, `server buildInfo must read ${v}`).toContain(`process.env.${v}`);
    }
  });
});
