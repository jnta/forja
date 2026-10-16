import { readFileSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadLibrary } from "@/application/library/load";
import { runSync } from "@/application/use-cases/sync";
import { CODES } from "@/domain/diagnostics";
import { validateAdapterId } from "@/domain/harness-adapter";
import { OpenCodeCompilerAdapter } from "@/infrastructure/adapters/portability/opencode/opencode-adapter";
import { SampleCompilerAdapter } from "@/infrastructure/adapters/portability/sample/sample-adapter";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { createFixtureAdapter } from "@/test/fixture-adapter";
import { writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

const filesystem = new NodeFilesystem();
const yaml = new YamlParser();
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

const AGENT_WITH_MCP = `type: subagent
capabilities:
  filesystem:
    read: true
    write: false
  shell:
    enabled: false
  network: false
skills:
  - testing
tools:
  - read
  - github
mcp:
  - id: github
    transport: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    credentials:
      - name: github
        from: env
        key: GITHUB_TOKEN
`;

async function writeAgentFixture(extra = ""): Promise<void> {
  await writeText(
    libraryRoot,
    "skills/testing/SKILL.md",
    "---\nname: testing\ndescription: Testing skill.\n---\n\n# Testing\n",
  );
  await writeText(libraryRoot, "agents/reviewer/agent.yaml", AGENT_WITH_MCP + extra);
  await writeText(libraryRoot, "agents/reviewer/AGENT.md", "# Reviewer\n");
}

function context(extra: Record<string, unknown> = {}) {
  return { projectDir, globalDir, homeDir: filesystem.homeDir(), ...extra };
}

describe("tool/MCP declarations and credentials", () => {
  it("documents declarations without copying secret values", async () => {
    await writeAgentFixture();
    await writeText(
      projectDir,
      "forja.yaml",
      "version: 1\nverification:\n  check: make check\n  verify: make verify\n",
    );

    const { ir } = await loadLibrary(
      { filesystem, yaml, knownHarnesses: ["opencode"] },
      { projectDir, globalDir },
    );
    expect(ir.mcpServers.map((server) => server.id)).toEqual(["github"]);
    expect(ir.tools.map((tool) => tool.name).sort()).toEqual(["github", "read"]);

    const artifacts = await new OpenCodeCompilerAdapter({ filesystem }).compile(
      ir,
      context(),
    );
    const instructions = artifacts.find((artifact) => artifact.kind === "instructions");
    expect(instructions?.contents).toContain("## MCP servers");
    expect(instructions?.contents).toContain("credential github from env GITHUB_TOKEN");
    // No secret value is ever written.
    expect(instructions?.contents).not.toContain("value:");
    expect(JSON.stringify(artifacts)).not.toContain("secret-value");
  });

  it("reports the declarative fallback in validation", async () => {
    await writeAgentFixture();
    const { ir } = await loadLibrary({ filesystem, yaml }, { projectDir, globalDir });
    const diagnostics = await new OpenCodeCompilerAdapter({ filesystem }).validate(
      ir,
      context(),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(CODES.compatDegraded);
  });

  it("warns about unknown harness extensions", async () => {
    await writeAgentFixture("\nharness:\n  cursor:\n    model: fast\n");
    const { diagnostics } = await loadLibrary(
      { filesystem, yaml, knownHarnesses: ["opencode"] },
      { projectDir, globalDir },
    );
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      CODES.unknownExtension,
    );
  });
});

describe("adapter authoring contract", () => {
  it("rejects reserved and malformed adapter ids", () => {
    expect(() => validateAdapterId("forja")).toThrow(/reserved/);
    expect(() => validateAdapterId("Bad Id")).toThrow(/invalid/);
    expect(() => new SampleCompilerAdapter({ filesystem, id: "core" })).toThrow(
      /reserved/,
    );
  });

  it("registers a fixture adapter without changing domain use cases", async () => {
    await writeText(
      libraryRoot,
      "skills/testing/SKILL.md",
      "---\nname: testing\ndescription: Testing skill.\n---\n\n# Testing\n",
    );
    await writeText(projectDir, "forja.yaml", "version: 1\nharnesses:\n  - custom\n");

    const report = await runSync(
      {
        filesystem,
        yaml,
        adapters: [
          createFixtureAdapter({
            id: "custom",
            artifacts: (_ir, ctx) => [
              { path: path.join(ctx.projectDir, ".custom", "output.md"), contents: "ok\n" },
            ],
          }),
        ],
      },
      { paths: { projectDir, globalDir }, mode: "apply" },
    );

    expect(report.aborted).toBe(false);
    expect(await filesystem.exists(path.join(projectDir, ".custom", "output.md"))).toBe(true);
  });

  it("rejects artifacts that escape the project root", async () => {
    await writeText(
      libraryRoot,
      "skills/testing/SKILL.md",
      "---\nname: testing\ndescription: Testing skill.\n---\n\n# Testing\n",
    );
    await writeText(projectDir, "forja.yaml", "version: 1\nharnesses:\n  - custom\n");

    const report = await runSync(
      {
        filesystem,
        yaml,
        adapters: [
          createFixtureAdapter({
            id: "custom",
            artifacts: () => [
              { path: path.resolve(projectDir, "..", "escape.txt"), contents: "no\n" },
            ],
          }),
        ],
      },
      { paths: { projectDir, globalDir }, mode: "dry-run" },
    );

    expect(report.plan.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      CODES.unsafeArtifactPath,
    );
  });

  it("does not import execution or LLM stacks in compiler adapters", () => {
    const root = fileURLToPath(new URL(".", import.meta.url));
    const forbidden = /from\s+["'](execa|node:child_process|@langchain\/|@opencode-ai\/)/;
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
          if (forbidden.test(readFileSync(full, "utf8"))) offenders.push(full);
        }
      }
    };
    walk(root);

    expect(offenders).toEqual([]);
  });
});
