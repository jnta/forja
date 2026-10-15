import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ForjaIr } from "@/domain/ir";
import { loadLibrary } from "@/application/library/load";
import { CODES } from "@/domain/diagnostics";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import {
  writeAgent,
  writePolicy,
  writeSkill,
  writeText,
  writeWorkflow,
} from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { composeManagedFile, MANAGED_BEGIN, renderInstructionsBlock } from "../shared/instructions";
import { OpenCodeCompilerAdapter } from "./opencode-adapter";
import { renderAgent } from "./agents";

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

async function loadIr(): Promise<ForjaIr> {
  const result = await loadLibrary({ filesystem, yaml }, { projectDir, globalDir });
  return result.ir;
}

function adapter(): OpenCodeCompilerAdapter {
  return new OpenCodeCompilerAdapter({ filesystem });
}

function context() {
  return { projectDir, globalDir, homeDir: filesystem.homeDir() };
}

function findArtifact(
  artifacts: readonly { path: string; contents: string }[],
  relative: string,
): { path: string; contents: string } | undefined {
  const target = path.join(projectDir, relative);
  return artifacts.find((artifact) => artifact.path === target);
}

describe("OpenCode compiler adapter — golden output", () => {
  it("compiles skills, resources, agents and instructions", async () => {
    await writeSkill(libraryRoot, "testing", {
      files: { "references/guide.md": "# Guide\n" },
    });
    await writeSkill(libraryRoot, "code-review", {});
    await writeAgent(libraryRoot, "reviewer", {
      description: "Reviews changes.",
      shell: "    enabled: true\n    mutating: false",
      skills: "  - code-review",
      body: "# Reviewer\n\nDo not modify code.\n",
    });
    await writeWorkflow(libraryRoot, "feature", "name: feature\nsteps:\n  - explore\n");
    await writePolicy(libraryRoot, "engineering", "rules:\n  - never-disable-tests\n");
    await writeText(
      projectDir,
      "forja.yaml",
      "version: 1\nverification:\n  check: make check\n  verify: make verify\n",
    );

    const ir = await loadIr();
    const artifacts = await adapter().compile(ir, context());

    const skill = findArtifact(artifacts, ".agents/skills/testing/SKILL.md");
    expect(skill?.contents).toBe(
      "---\nname: testing\ndescription: The testing skill.\n---\n\n# testing\n",
    );

    const resource = findArtifact(artifacts, ".agents/skills/testing/references/guide.md");
    expect(resource?.contents).toBe("# Guide\n");

    const agent = findArtifact(artifacts, ".opencode/agents/reviewer.md");
    expect(agent?.contents).toBe(
      [
        "---",
        "description: Reviews changes.",
        "mode: subagent",
        "permission:",
        "  read: allow",
        "  edit: deny",
        "  bash: deny",
        "  webfetch: deny",
        "  websearch: deny",
        "  skill:",
        '    "*": deny',
        "    code-review: allow",
        "---",
        "",
        "# Reviewer",
        "",
        "Do not modify code.",
        "",
      ].join("\n"),
    );

    const agentsMd = findArtifact(artifacts, "AGENTS.md");
    expect(agentsMd?.contents).toContain(MANAGED_BEGIN);
    expect(agentsMd?.contents).toContain("## Workflow");
    expect(agentsMd?.contents).toContain("## Rules");
    expect(agentsMd?.contents).toContain("- never-disable-tests");
    expect(agentsMd?.contents).toContain("## Verification");
    expect(agentsMd?.contents).toContain("make verify");
  });

  it("never emits opencode.json", async () => {
    await writeSkill(libraryRoot, "testing", {});
    const artifacts = await adapter().compile(await loadIr(), context());
    expect(artifacts.some((artifact) => artifact.path.endsWith("opencode.json"))).toBe(
      false,
    );
  });
});

describe("OpenCode compiler adapter — capabilities", () => {
  it("warns and disables shell for a read-only shell request", async () => {
    await writeAgent(libraryRoot, "reviewer", {
      shell: "    enabled: true\n    mutating: false",
    });
    const ir = await loadIr();
    const diagnostics = await adapter().validate(ir, context());
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      CODES.compatDegraded,
    );

    const agent = findArtifact(
      await adapter().compile(ir, context()),
      ".opencode/agents/reviewer.md",
    );
    expect(agent?.contents).toContain("bash: deny");
    expect(agent?.contents).not.toContain("bash: allow");
  });

  it("maps a full shell exactly", async () => {
    await writeAgent(libraryRoot, "implementer", {
      shell: "    enabled: true\n    mutating: true",
    });
    const ir = await loadIr();
    expect(await adapter().validate(ir, context())).toEqual([]);
    const agent = findArtifact(
      await adapter().compile(ir, context()),
      ".opencode/agents/implementer.md",
    );
    expect(agent?.contents).toContain("bash: allow");
  });

  it("passes explicit harness extensions through", async () => {
    await writeAgent(libraryRoot, "reviewer", {
      description: "Reviews.",
      body: "# Reviewer\n",
      harness: "harness:\n  opencode:\n    model: anthropic/claude-sonnet\n",
    });
    const ir = await loadIr();
    const agent = findArtifact(
      await adapter().compile(ir, context()),
      ".opencode/agents/reviewer.md",
    );
    expect(agent?.contents).toContain("model: anthropic/claude-sonnet");
  });
});

describe("OpenCode compiler adapter — detection", () => {
  it("detects project configuration", async () => {
    await writeText(projectDir, "opencode.json", "{}\n");
    const detection = await adapter().detect(context());
    expect(detection.installed).toBe(true);
    expect(detection.evidence).toContain("opencode.json");
  });

  it("reports when OpenCode is absent", async () => {
    const detection = await adapter().detect(context());
    expect(detection.installed).toBe(false);
  });
});

describe("AGENTS.md managed block", () => {
  it("preserves manual content and replaces only the managed block", () => {
    const manual = "# My project\n\nKeep me.\n";
    const block = `${MANAGED_BEGIN}\nold\n${"<!-- forja:end -->"}`;

    const composed = composeManagedFile(`${manual}\n${block}\n`, `${MANAGED_BEGIN}\nnew\n<!-- forja:end -->`);
    expect(composed).toContain("# My project");
    expect(composed).toContain("Keep me.");
    expect(composed).toContain("new");
    expect(composed).not.toContain("old");
  });

  it("is deterministic", () => {
    const input = {
      workflows: [],
      policies: [{ id: "p", description: "p", rules: ["b", "a"] }],
      verification: { fast: "a", full: "b" },
    };
    const block = renderInstructionsBlock(input);
    expect(renderInstructionsBlock(input)).toBe(block);
    expect(block.indexOf("- a")).toBeLessThan(block.indexOf("- b"));
  });
});

describe("renderAgent", () => {
  it("keeps frontmatter deterministic", () => {
    const ir: ForjaIr["agents"][number] = {
      id: "reviewer",
      description: "Reviews.",
      type: "subagent",
      instructions: "Do it.",
      capabilities: { readFiles: true, writeFiles: false, shell: "none", network: false },
      skills: [],
    };
    expect(renderAgent(ir, "none")).toBe(renderAgent(ir, "none"));
  });
});
