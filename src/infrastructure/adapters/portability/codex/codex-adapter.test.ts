import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CODES } from "@/domain/diagnostics";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { writeAgent } from "@/test/library-fixtures";
import { loadIr } from "@/test/ir-fixture";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { CodexCompilerAdapter } from "./codex-adapter";

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
  return new CodexCompilerAdapter({ filesystem });
}

function context(extra: Record<string, unknown> = {}) {
  return { projectDir, globalDir, homeDir: filesystem.homeDir(), ...extra };
}

function agentArtifact(
  artifacts: ReadonlyArray<{ path: string; contents: string }>,
  id: string,
): { path: string; contents: string } | undefined {
  return artifacts.find((artifact) =>
    artifact.path.endsWith(path.join(".codex", "agents", `${id}.toml`)),
  );
}

describe("Codex adapter", () => {
  it("renders a custom agent TOML", async () => {
    await writeAgent(libraryRoot, "implementer", {
      description: "Implements changes.",
      filesystem: "    read: true\n    write: true",
      shell: "    enabled: true\n    mutating: true",
      network: "true",
      body: "# Implementer\n",
    });

    const ir = await loadIr(projectDir, globalDir);
    const agent = agentArtifact(await adapter().compile(ir, context()), "implementer");

    expect(agent?.contents).toBe(
      [
        'name = "implementer"',
        'description = "Implements changes."',
        'developer_instructions = "# Implementer"',
        "",
      ].join("\n"),
    );
  });

  it("reports unsupported semantics and emits no agent by default", async () => {
    await writeAgent(libraryRoot, "reviewer", {
      shell: "    enabled: false",
      body: "# Reviewer\n",
    });

    const ir = await loadIr(projectDir, globalDir);
    const diagnostics = await adapter().validate(ir, context());
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      CODES.compatUnsupported,
    );
    expect(agentArtifact(await adapter().compile(ir, context()), "reviewer")).toBeUndefined();
  });

  it("uses an instruction-only fallback when explicitly configured", async () => {
    await writeAgent(libraryRoot, "reviewer", {
      shell: "    enabled: false",
      body: "# Reviewer\n",
    });

    const ir = await loadIr(projectDir, globalDir);
    const ctx = context({ instructionFallback: true });
    const diagnostics = await adapter().validate(ir, ctx);
    expect(diagnostics.every((diagnostic) => diagnostic.severity === "warning")).toBe(true);

    const agent = agentArtifact(await adapter().compile(ir, ctx), "reviewer");
    expect(agent?.contents).toContain("features.shell_tool = false");
    expect(agent?.contents).toContain("Forja limitations:");
  });

  it("treats degraded semantics as errors under strict compatibility", async () => {
    await writeAgent(libraryRoot, "implementer", {
      filesystem: "    read: true\n    write: true",
      shell: "    enabled: true\n    mutating: false",
    });
    const ir = await loadIr(projectDir, globalDir);
    const diagnostics = await adapter().validate(ir, context({ strict: true }));
    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.code === CODES.compatDegraded && diagnostic.severity === "error",
      ),
    ).toBe(true);
  });
});
