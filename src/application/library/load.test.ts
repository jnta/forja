import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FilesystemPort } from "@/domain/filesystem";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { loadLibrary, type LoadLibraryDeps } from "./load";
import { CODES } from "./diagnostics";
import {
  createSymlink,
  writeAgent,
  writePack,
  writePolicy,
  writeSkill,
  writeText,
  writeWorkflow,
} from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

const filesystem = new NodeFilesystem();
const deps: LoadLibraryDeps = { filesystem, yaml: new YamlParser() };

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

function load() {
  return loadLibrary(deps, { projectDir, globalDir });
}

function codes(diagnostics: ReadonlyArray<{ code: string }>): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

describe("loadLibrary — valid definitions", () => {
  it("normalizes skills, agents, workflows, policies and packs into sorted IR", async () => {
    await writeSkill(libraryRoot, "testing", {
      metadata: [
        "version: 2.4.1",
        "category: engineering",
        "tags:",
        "  - quality",
        "  - test",
        "compatibility:",
        "  opencode: '>=2'",
        "dependencies:",
        "  code-review: ^1",
      ].join("\n"),
      files: { "references/guide.md": "# guide\n" },
    });
    await writeSkill(libraryRoot, "code-review", {
      metadata: "version: 1.0.0",
    });
    await writeAgent(libraryRoot, "reviewer", {
      shell: "    enabled: true\n    mutating: false",
      skills: "  - code-review",
      body: "# Reviewer\n\nDo not modify code.\n",
    });
    await writeWorkflow(
      libraryRoot,
      "feature",
      "name: feature\nsteps:\n  - explore\n  - id: verify\n    description: Verify changes\n",
    );
    await writePolicy(
      libraryRoot,
      "engineering",
      "rules:\n  - prefer-existing-patterns\n  - never-disable-tests\n",
    );
    await writePack(
      libraryRoot,
      "core",
      [
        "version: 1.0.0",
        "skills:",
        "  - testing@^2",
        "agents:",
        "  - reviewer@^1",
        "config:",
        "  harnesses:",
        "    opencode:",
        "      enabled: true",
      ].join("\n"),
    );
    await writeText(
      projectDir,
      "forja.yaml",
      [
        "version: 1",
        "harnesses:",
        "  - opencode",
        "  - codex",
        "verification:",
        "  check: make check",
        "  verify: make verify",
      ].join("\n"),
    );

    const result = await load();

    expect(codes(result.diagnostics)).toEqual([]);
    expect(result.ir.skills.map((skill) => skill.id)).toEqual([
      "code-review",
      "testing",
    ]);

    const testing = result.ir.skills.find((skill) => skill.id === "testing");
    expect(testing).toMatchObject({
      category: "engineering",
      tags: ["quality", "test"],
      resources: ["references/guide.md"],
      compatibility: { opencode: ">=2" },
    });
    expect(testing?.dependencies).toEqual([
      { kind: "skill", name: "code-review", range: "^1" },
    ]);

    const reviewer = result.ir.agents[0];
    expect(reviewer.capabilities).toEqual({
      readFiles: true,
      writeFiles: false,
      shell: "readonly",
      network: false,
    });
    expect(reviewer.skills).toEqual(["code-review"]);

    expect(result.ir.workflows[0].steps).toEqual([
      { id: "explore", description: "" },
      { id: "verify", description: "Verify changes" },
    ]);

    expect(result.ir.policies[0].rules).toEqual([
      "never-disable-tests",
      "prefer-existing-patterns",
    ]);

    expect(result.ir.packs[0]).toMatchObject({ id: "core", version: "1.0.0" });
    expect(result.ir.packs[0].skills).toEqual([
      { kind: "skill", name: "testing", range: "^2" },
    ]);

    expect(result.config.verification).toEqual({
      fast: "make check",
      full: "make verify",
    });
    expect(result.config.harnesses).toEqual([
      { id: "codex", enabled: true },
      { id: "opencode", enabled: true },
    ]);
  });

  it("is deterministic across repeated loads", async () => {
    await writeSkill(libraryRoot, "b", {});
    await writeSkill(libraryRoot, "a", {});
    await writeAgent(libraryRoot, "a", { skills: "  - a" });

    const first = await load();
    const second = await load();

    expect(JSON.stringify(first.ir)).toBe(JSON.stringify(second.ir));
    expect(first.ir.skills.map((skill) => skill.id)).toEqual(["a", "b"]);
  });

  it("lets a project definition override a global definition of the same id", async () => {
    await writeSkill(globalDir, "testing", { body: "# global\n" });
    await writeSkill(libraryRoot, "testing", { body: "# project\n" });

    const result = await load();

    expect(codes(result.diagnostics)).toEqual([]);
    expect(result.ir.skills).toHaveLength(1);
    expect(result.ir.skills[0].instructions).toContain("project");
  });
});

describe("loadLibrary — failure modes", () => {
  it("reports malformed frontmatter", async () => {
    await writeText(libraryRoot, "skills/bad/SKILL.md", "---\nname: bad\n");

    const result = await load();

    expect(codes(result.diagnostics)).toContain(CODES.invalidFrontmatter);
  });

  it("reports malformed YAML", async () => {
    await writeSkill(libraryRoot, "bad", { metadata: "dependencies: [a, b" });

    const result = await load();

    expect(codes(result.diagnostics)).toContain(CODES.invalidYaml);
  });

  it("reports duplicate ids", async () => {
    await writePack(libraryRoot, "dup", "version: 1.0.0\n", "yaml");
    await writePack(libraryRoot, "dup", "version: 1.0.0\n", "yml");

    const result = await load();

    expect(codes(result.diagnostics)).toContain(CODES.duplicateId);
  });

  it("reports missing references", async () => {
    await writeAgent(libraryRoot, "reviewer", { skills: "  - does-not-exist" });

    const result = await load();

    expect(codes(result.diagnostics)).toContain(CODES.missingReference);
  });

  it("reports invalid versions", async () => {
    await writeSkill(libraryRoot, "bad", { metadata: "version: not-a-version" });

    const result = await load();

    expect(codes(result.diagnostics)).toContain(CODES.invalidSchema);
  });

  it("reports dependency cycles", async () => {
    await writeSkill(libraryRoot, "a", { metadata: "dependencies:\n  - b" });
    await writeSkill(libraryRoot, "b", { metadata: "dependencies:\n  - a" });

    const result = await load();

    expect(codes(result.diagnostics)).toContain(CODES.dependencyCycle);
  });

  it("reports traversal in declared resources", async () => {
    await writeSkill(libraryRoot, "escape", {
      metadata: "resources:\n  - ../../secret",
    });

    const result = await load();

    expect(codes(result.diagnostics)).toContain(CODES.unsafePath);
  });

  it("reports symlinks that escape the skill directory", async () => {
    const outside = path.join(projectDir, "secret.txt");
    await writeText(projectDir, "secret.txt", "top secret");
    await writeSkill(libraryRoot, "linked", {});
    await createSymlink(libraryRoot, "skills/linked/references/escape", outside);

    const result = await load();

    expect(codes(result.diagnostics)).toContain(CODES.unsafePath);
  });
});

describe("loadLibrary — safety", () => {
  it("never writes to the filesystem", async () => {
    await writeSkill(libraryRoot, "testing", {});
    const readOnly: FilesystemPort = {
      cwd: () => filesystem.cwd(),
      homeDir: () => filesystem.homeDir(),
      resolve: (...segments) => filesystem.resolve(...segments),
      exists: (target) => filesystem.exists(target),
      stat: (target) => filesystem.stat(target),
      realpath: (target) => filesystem.realpath(target),
      readFile: (target) => filesystem.readFile(target),
      readDir: (target) => filesystem.readDir(target),
      rename: () => {
        throw new Error("rename must not be called");
      },
      writeFile: () => {
        throw new Error("writeFile must not be called");
      },
      mkdir: () => {
        throw new Error("mkdir must not be called");
      },
      remove: () => {
        throw new Error("remove must not be called");
      },
    };

    const result = await loadLibrary(
      { filesystem: readOnly, yaml: deps.yaml },
      { projectDir, globalDir },
    );

    expect(codes(result.diagnostics)).toEqual([]);
  });

  it("never executes verification commands", async () => {
    const marker = path.join(projectDir, "executed.marker");
    await writeText(
      projectDir,
      "forja.yaml",
      `version: 1\nverification:\n  fast: node -e "require('fs').writeFileSync('${marker}','x')"\n  full: echo done\n`,
    );

    const result = await load();

    expect(result.config.verification.fast).toContain("writeFileSync");
    await expect(filesystem.exists(marker)).resolves.toBe(false);
  });
});
