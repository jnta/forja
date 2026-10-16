import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadLibrary } from "@/application/library/load";
import { resolvePackages } from "@/application/resolve/resolver";
import { FilesystemContentCache } from "@/infrastructure/cache/content-cache";
import { ClaudeCompilerAdapter } from "@/infrastructure/adapters/portability/claude/claude-adapter";
import { CodexCompilerAdapter } from "@/infrastructure/adapters/portability/codex/codex-adapter";
import { OpenCodeCompilerAdapter } from "@/infrastructure/adapters/portability/opencode/opencode-adapter";
import { SampleCompilerAdapter } from "@/infrastructure/adapters/portability/sample/sample-adapter";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { RegistrySource } from "@/infrastructure/sources/registry-source";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

const catalogRoot = fileURLToPath(new URL("../catalog", import.meta.url));
const filesystem = new NodeFilesystem();
const yaml = new YamlParser();
const KNOWN = ["opencode", "claude-code", "codex"];

let projectDir: string;
let workspace: string;

beforeEach(async () => {
  workspace = await createTempDir();
  projectDir = path.join(workspace, "project");
  await mkdir(projectDir, { recursive: true });
});

afterEach(async () => {
  await removeTempDir(workspace);
});

async function loadCatalog() {
  await writeText(projectDir, "forja.yaml", "version: 1\nverification:\n  check: make check\n  verify: make verify\n");
  await writeText(
    projectDir,
    ".forja/workflows/feature.yaml",
    "name: feature\nsteps:\n  - explore\n  - plan\n  - implement\n",
  );
  return loadLibrary(
    { filesystem, yaml, knownHarnesses: KNOWN },
    { projectDir, globalDir: catalogRoot },
  );
}

function context() {
  return {
    projectDir,
    globalDir: catalogRoot,
    homeDir: filesystem.homeDir(),
    instructionFallback: true,
  };
}

const ADAPTERS = [
  { id: "opencode", create: () => new OpenCodeCompilerAdapter({ filesystem }) },
  { id: "claude-code", create: () => new ClaudeCompilerAdapter({ filesystem }) },
  { id: "codex", create: () => new CodexCompilerAdapter({ filesystem }) },
  { id: "sample", create: () => new SampleCompilerAdapter({ filesystem }) },
];

describe("built-in catalog", () => {
  it("validates and exposes the core agents, skills and packs", async () => {
    const result = await loadCatalog();

    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(result.ir.skills).toHaveLength(10);
    expect(result.ir.agents.map((agent) => agent.id)).toEqual([
      "implementer",
      "orchestrator",
      "reviewer",
    ]);
    expect(result.ir.packs.map((pack) => pack.id)).toEqual([
      "core-engineering",
      "distributed-systems",
      "frontend",
      "java-backend",
    ]);
    const documentation = result.ir.skills.find((skill) => skill.id === "documentation");
    expect(documentation?.resources).toContain("references/guide.md");
  });

  it.each(ADAPTERS)("compiles the catalog through $id", async (spec) => {
    const { ir } = await loadCatalog();
    const artifacts = await spec.create().compile(ir, context());
    const paths = artifacts.map((artifact) => artifact.path);

    expect(paths.some((p) => p.endsWith(path.join("skills", "testing", "SKILL.md")))).toBe(true);
    expect(paths.some((p) => p.endsWith(path.join("documentation", "references", "guide.md")))).toBe(true);

    const instructions = artifacts.find((artifact) => artifact.kind === "instructions");
    expect(instructions?.contents).toContain("1. explore");
    expect(instructions?.contents).toContain("2. plan");
    expect(instructions?.contents).toContain("make verify");
  });

  it("resolves pack dependencies from the catalog", async () => {
    const binding = {
      spec: { kind: "registry" as const, location: "catalog", raw: "registry:catalog" },
      port: new RegistrySource(catalogRoot),
    };
    const result = await resolvePackages(
      {
        filesystem,
        yaml,
        sources: [binding],
        cache: new FilesystemContentCache(path.join(workspace, "cache")),
        stagingRoot: path.join(workspace, "staging"),
      },
      {
        roots: [{ kind: "pack", name: "core-engineering" }],
        mode: "install",
        consent: { allow: true },
      },
    );

    const keys = result.packages.map((pkg) => `${pkg.kind}:${pkg.name}`);
    expect(keys).toContain("pack:core-engineering");
    expect(keys).toContain("skill:testing");
    expect(keys).toContain("agent:reviewer");
  });
});
