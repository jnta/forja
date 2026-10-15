import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { OpenCodeCompilerAdapter } from "@/infrastructure/adapters/portability/opencode/opencode-adapter";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { writeAgent, writeSkill, writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { runSync, type SyncDeps } from "./sync";

const filesystem = new NodeFilesystem();
let projectDir: string;
let globalDir: string;
let libraryRoot: string;

beforeEach(async () => {
  projectDir = await createTempDir();
  globalDir = path.join(projectDir, "global");
  libraryRoot = path.join(projectDir, ".forja");
  await mkdir(globalDir, { recursive: true });
});

afterEach(async () => {
  await removeTempDir(projectDir);
});

function deps(): SyncDeps {
  return {
    filesystem,
    yaml: new YamlParser(),
    adapters: [new OpenCodeCompilerAdapter({ filesystem })],
  };
}

function paths() {
  return { projectDir, globalDir };
}

describe("runSync with the OpenCode adapter", () => {
  it("syncs a fixture project and resyncs without drift", async () => {
    await writeSkill(libraryRoot, "testing", {});
    await writeAgent(libraryRoot, "reviewer", { skills: "  - testing" });
    await writeText(projectDir, "forja.yaml", "version: 1\nharnesses:\n  - opencode\n");

    const first = await runSync(deps(), { paths: paths(), mode: "apply" });
    expect(first.aborted).toBe(false);
    expect(first.applied).toBeGreaterThan(0);
    expect(
      await filesystem.exists(
        path.join(projectDir, ".agents", "skills", "testing", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      await filesystem.exists(path.join(projectDir, ".opencode", "agents", "reviewer.md")),
    ).toBe(true);

    const second = await runSync(deps(), { paths: paths(), mode: "apply" });
    expect(second.plan.changes).toBe(0);
  });

  it("preserves existing opencode.json and manual AGENTS.md content", async () => {
    await writeSkill(libraryRoot, "testing", {});
    await writePolicy();
    await writeText(projectDir, "forja.yaml", "version: 1\nharnesses:\n  - opencode\n");
    await writeText(projectDir, "opencode.json", '{"manual":true}\n');
    await writeText(projectDir, "AGENTS.md", "# Manual rules\n\nKeep me.\n");

    await runSync(deps(), { paths: paths(), mode: "apply" });

    expect(await filesystem.readFile(path.join(projectDir, "opencode.json"))).toBe(
      '{"manual":true}\n',
    );
    const agentsMd = await filesystem.readFile(path.join(projectDir, "AGENTS.md"));
    expect(agentsMd).toContain("# Manual rules");
    expect(agentsMd).toContain("Keep me.");
    expect(agentsMd).toContain("<!-- forja:begin -->");
  });

  it("reports drift in check mode after a generated file is edited", async () => {
    await writeSkill(libraryRoot, "testing", {});
    await writeText(projectDir, "forja.yaml", "version: 1\nharnesses:\n  - opencode\n");
    await runSync(deps(), { paths: paths(), mode: "apply" });

    const generated = path.join(projectDir, ".agents", "skills", "testing", "SKILL.md");
    await filesystem.writeFile(generated, "# tampered\n");

    const check = await runSync(deps(), { paths: paths(), mode: "check" });
    expect(check.plan.conflicts).toHaveLength(1);
    expect(check.plan.conflicts[0].reason).toBe("modified-managed");
  });

  it("skips adapters that are disabled in configuration", async () => {
    await writeSkill(libraryRoot, "testing", {});
    await writeText(
      projectDir,
      "forja.yaml",
      "version: 1\nharnesses:\n  opencode:\n    enabled: false\n",
    );

    const report = await runSync(deps(), { paths: paths(), mode: "dry-run" });
    expect(report.plan.entries).toEqual([]);
  });
});

async function writePolicy(): Promise<void> {
  await writeText(
    libraryRoot,
    "policies/engineering.yaml",
    "rules:\n  - never-disable-tests\n",
  );
}
