import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { HarnessAdapterPort } from "@/domain/harness-adapter";
import { ClaudeCompilerAdapter } from "@/infrastructure/adapters/portability/claude/claude-adapter";
import { CodexCompilerAdapter } from "@/infrastructure/adapters/portability/codex/codex-adapter";
import { OpenCodeCompilerAdapter } from "@/infrastructure/adapters/portability/opencode/opencode-adapter";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { writeAgent, writeSkill, writeText } from "@/test/library-fixtures";
import { loadIr } from "@/test/ir-fixture";
import { createTempDir, removeTempDir } from "@/test/helpers";

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

interface AdapterSpec {
  readonly id: string;
  readonly create: () => HarnessAdapterPort;
  readonly skillsDir: string;
  readonly agentFile: (id: string) => string;
  readonly instructions: string;
}

const SPECS: readonly AdapterSpec[] = [
  {
    id: "opencode",
    create: () => new OpenCodeCompilerAdapter({ filesystem }),
    skillsDir: ".agents/skills",
    agentFile: (id) => `.opencode/agents/${id}.md`,
    instructions: "AGENTS.md",
  },
  {
    id: "claude-code",
    create: () => new ClaudeCompilerAdapter({ filesystem }),
    skillsDir: ".claude/skills",
    agentFile: (id) => `.claude/agents/${id}.md`,
    instructions: "CLAUDE.md",
  },
  {
    id: "codex",
    create: () => new CodexCompilerAdapter({ filesystem }),
    skillsDir: ".agents/skills",
    agentFile: (id) => `.codex/agents/${id}.toml`,
    instructions: "AGENTS.md",
  },
];

function context() {
  return { projectDir, globalDir, homeDir: filesystem.homeDir() };
}

describe.each(SPECS)("harness adapter contract — $id", (spec) => {
  it("compiles a skill, an agent and instructions", async () => {
    await writeSkill(libraryRoot, "testing", {});
    await writeAgent(libraryRoot, "implementer", {
      description: "Implements changes.",
      filesystem: "    read: true\n    write: true",
      shell: "    enabled: true\n    mutating: true",
      network: "true",
      skills: "  - testing",
      body: "# Implementer\n",
    });
    await writeText(projectDir, "forja.yaml", "version: 1\nverification:\n  check: make check\n  verify: make verify\n");

    const ir = await loadIr(projectDir, globalDir);
    const artifacts = await spec.create().compile(ir, context());
    const paths = artifacts.map((artifact) => artifact.path);

    expect(paths).toContain(path.join(projectDir, spec.skillsDir, "testing", "SKILL.md"));
    expect(paths).toContain(path.join(projectDir, spec.agentFile("implementer")));
    const instructions = artifacts.find(
      (artifact) => artifact.path === path.join(projectDir, spec.instructions),
    );
    expect(instructions?.contents).toContain("<!-- forja:begin -->");
  });

  it("detects an empty project and inspects state", async () => {
    const adapter = spec.create();
    const detection = await adapter.detect(context());
    expect(detection.installed).toBe(false);
    expect((await adapter.inspect(context())).configured).toBe(false);
  });

  it("validates a fully supported agent without diagnostics", async () => {
    await writeAgent(libraryRoot, "implementer", {
      filesystem: "    read: true\n    write: true",
      shell: "    enabled: true\n    mutating: true",
      network: "true",
    });
    const ir = await loadIr(projectDir, globalDir);
    expect(await spec.create().validate(ir, context())).toEqual([]);
  });
});
