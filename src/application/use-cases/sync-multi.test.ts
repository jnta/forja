import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ClaudeCompilerAdapter } from "@/infrastructure/adapters/portability/claude/claude-adapter";
import { CodexCompilerAdapter } from "@/infrastructure/adapters/portability/codex/codex-adapter";
import { OpenCodeCompilerAdapter } from "@/infrastructure/adapters/portability/opencode/opencode-adapter";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
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
    adapters: [
      new OpenCodeCompilerAdapter({ filesystem }),
      new ClaudeCompilerAdapter({ filesystem }),
      new CodexCompilerAdapter({ filesystem }),
    ],
  };
}

function paths() {
  return { projectDir, globalDir };
}

async function seedProject(): Promise<void> {
  await writeSkill(libraryRoot, "testing", {});
  await writeAgent(libraryRoot, "implementer", {
    description: "Implements changes.",
    filesystem: "    read: true\n    write: true",
    shell: "    enabled: true\n    mutating: true",
    network: "true",
    skills: "  - testing",
    body: "# Implementer\n",
  });
  await writeText(
    projectDir,
    "forja.yaml",
    "version: 1\nharnesses:\n  - opencode\n  - claude-code\n  - codex\nverification:\n  check: make check\n  verify: make verify\n",
  );
}

async function exists(relative: string): Promise<boolean> {
  return filesystem.exists(path.join(projectDir, relative));
}

describe("combined multi-harness sync", () => {
  it("shares .agents/skills and AGENTS.md without collisions and resyncs clean", async () => {
    await seedProject();

    const first = await runSync(deps(), { paths: paths(), mode: "apply" });
    expect(first.aborted).toBe(false);
    expect(first.plan.conflicts).toEqual([]);
    expect(await exists(".agents/skills/testing/SKILL.md")).toBe(true);
    expect(await exists("AGENTS.md")).toBe(true);
    expect(await exists(".claude/skills/testing/SKILL.md")).toBe(true);
    expect(await exists("CLAUDE.md")).toBe(true);
    expect(await exists(".opencode/agents/implementer.md")).toBe(true);
    expect(await exists(".claude/agents/implementer.md")).toBe(true);
    expect(await exists(".codex/agents/implementer.toml")).toBe(true);

    const second = await runSync(deps(), { paths: paths(), mode: "apply" });
    expect(second.plan.changes).toBe(0);
  });

  it("disabling a harness removes only its exclusive artifacts", async () => {
    await seedProject();
    await runSync(deps(), { paths: paths(), mode: "apply" });

    await writeText(
      projectDir,
      "forja.yaml",
      "version: 1\nharnesses:\n  opencode:\n    enabled: false\n  claude-code:\n    enabled: true\n  codex:\n    enabled: true\nverification:\n  check: make check\n  verify: make verify\n",
    );

    const resync = await runSync(deps(), { paths: paths(), mode: "apply" });
    expect(resync.deleted).toBe(1);
    expect(await exists(".opencode/agents/implementer.md")).toBe(false);
    // Shared and other-harness artifacts remain.
    expect(await exists(".agents/skills/testing/SKILL.md")).toBe(true);
    expect(await exists("AGENTS.md")).toBe(true);
    expect(await exists(".claude/agents/implementer.md")).toBe(true);
    expect(await exists(".codex/agents/implementer.toml")).toBe(true);
  });

  it("blocks application when a harness reports unsupported semantics", async () => {
    await writeSkill(libraryRoot, "testing", {});
    await writeAgent(libraryRoot, "reviewer", {
      shell: "    enabled: false",
      body: "# Reviewer\n",
    });
    await writeText(
      projectDir,
      "forja.yaml",
      "version: 1\nharnesses:\n  - codex\n",
    );

    const report = await runSync(deps(), { paths: paths(), mode: "apply" });
    expect(report.aborted).toBe(true);
    expect(report.applied).toBe(0);
    expect(await exists(".codex/agents/reviewer.toml")).toBe(false);
  });
});
