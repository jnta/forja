import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CODES } from "@/domain/diagnostics";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { writeAgent, writeSkill, writeText } from "@/test/library-fixtures";
import { loadIr } from "@/test/ir-fixture";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { ClaudeCompilerAdapter } from "./claude-adapter";

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

function adapter() {
  return new ClaudeCompilerAdapter({ filesystem });
}

function context() {
  return { projectDir, globalDir, homeDir: filesystem.homeDir() };
}

describe("Claude Code adapter", () => {
  it("renders a read-only reviewer with a restricted tool allowlist", async () => {
    await writeSkill(libraryRoot, "code-review", {});
    await writeAgent(libraryRoot, "reviewer", {
      description: "Reviews changes.",
      shell: "    enabled: false",
      skills: "  - code-review",
      body: "# Reviewer\n",
    });

    const ir = await loadIr(projectDir, globalDir);
    const artifacts = await adapter().compile(ir, context());
    const agent = artifacts.find(
      (artifact) => artifact.path === path.join(projectDir, ".claude/agents/reviewer.md"),
    );

    expect(agent?.contents).toBe(
      [
        "---",
        "name: reviewer",
        "description: Reviews changes.",
        "tools: Read, Grep, Glob, Skill",
        "---",
        "",
        "# Reviewer",
        "",
      ].join("\n"),
    );
  });

  it("preserves an existing CLAUDE.md", async () => {
    await writeSkill(libraryRoot, "testing", {});
    await writeText(projectDir, "forja.yaml", "version: 1\nverification:\n  check: make check\n  verify: make verify\n");
    await writeText(projectDir, "CLAUDE.md", "# Manual\n\nKeep me.\n");

    const ir = await loadIr(projectDir, globalDir);
    const artifacts = await adapter().compile(ir, context());
    const claudeMd = artifacts.find(
      (artifact) => artifact.path === path.join(projectDir, "CLAUDE.md"),
    );

    expect(claudeMd?.contents).toContain("# Manual");
    expect(claudeMd?.contents).toContain("Keep me.");
    expect(claudeMd?.contents).toContain("<!-- forja:begin -->");
  });

  it("warns when a read-only shell cannot be represented", async () => {
    await writeAgent(libraryRoot, "reviewer", {
      shell: "    enabled: true\n    mutating: false",
    });
    const ir = await loadIr(projectDir, globalDir);
    const diagnostics = await adapter().validate(ir, context());
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      CODES.compatDegraded,
    );
    const agent = (await adapter().compile(ir, context())).find((artifact) =>
      artifact.path.endsWith("reviewer.md"),
    );
    expect(agent?.contents).not.toContain("Bash");
  });
});
