import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { createFixtureAdapter } from "@/test/fixture-adapter";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { runSync, type SyncDeps } from "./sync";

const filesystem = new NodeFilesystem();
let projectDir: string;
let globalDir: string;

beforeEach(async () => {
  projectDir = await createTempDir();
  globalDir = path.join(projectDir, "global");
  await mkdir(globalDir, { recursive: true });
});

afterEach(async () => {
  await removeTempDir(projectDir);
});

function deps(): SyncDeps {
  return {
    filesystem,
    yaml: new YamlParser(),
    adapters: [
      createFixtureAdapter({
        id: "fixture",
        artifacts: (_ir, context) => [
          {
            path: path.join(context.projectDir, ".opencode", "agents", "reviewer.md"),
            contents: "# Reviewer\n",
          },
        ],
      }),
    ],
  };
}

function paths() {
  return { projectDir, globalDir };
}

describe("runSync", () => {
  it("applies generated output and is idempotent", async () => {
    const first = await runSync(deps(), { paths: paths(), mode: "apply" });
    expect(first.aborted).toBe(false);
    expect(first.applied).toBe(1);
    expect(
      await filesystem.readFile(
        path.join(projectDir, ".opencode", "agents", "reviewer.md"),
      ),
    ).toBe("# Reviewer\n");

    const second = await runSync(deps(), { paths: paths(), mode: "apply" });
    expect(second.plan.changes).toBe(0);
  });

  it("dry-run writes nothing", async () => {
    const report = await runSync(deps(), { paths: paths(), mode: "dry-run" });
    expect(report.plan.changes).toBe(1);
    expect(
      await filesystem.exists(path.join(projectDir, ".opencode", "agents", "reviewer.md")),
    ).toBe(false);
    expect(await filesystem.exists(path.join(projectDir, ".forja", "state.json"))).toBe(
      false,
    );
  });

  it("check reports drift without writing", async () => {
    await runSync(deps(), { paths: paths(), mode: "apply" });
    const generated = path.join(projectDir, ".opencode", "agents", "reviewer.md");
    await filesystem.writeFile(generated, "# Edited\n");

    const report = await runSync(deps(), { paths: paths(), mode: "check" });
    expect(report.plan.conflicts).toHaveLength(1);
    expect(await filesystem.readFile(generated)).toBe("# Edited\n");
  });

  it("aborts an apply that has unresolved conflicts", async () => {
    await runSync(deps(), { paths: paths(), mode: "apply" });
    const generated = path.join(projectDir, ".opencode", "agents", "reviewer.md");
    await filesystem.writeFile(generated, "# Edited\n");

    const report = await runSync(deps(), { paths: paths(), mode: "apply" });
    expect(report.aborted).toBe(true);
    expect(await filesystem.readFile(generated)).toBe("# Edited\n");
  });
});
