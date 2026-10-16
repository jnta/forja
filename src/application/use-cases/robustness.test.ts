import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OpenCodeCompilerAdapter } from "@/infrastructure/adapters/portability/opencode/opencode-adapter";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { writeSkill, writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { runSync, type SyncDeps } from "./sync";

const filesystem = new NodeFilesystem();
let workspace: string;
let projectDir: string;
let globalDir: string;

beforeEach(async () => {
  workspace = await createTempDir();
  // Spaces and Unicode in the project path.
  projectDir = path.join(workspace, "proj ção dir");
  globalDir = path.join(workspace, "global");
  await mkdir(projectDir, { recursive: true });
  await mkdir(globalDir, { recursive: true });
});

afterEach(async () => {
  await removeTempDir(workspace);
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

describe("platform robustness", () => {
  it("works in a project path with spaces and Unicode", async () => {
    await writeSkill(path.join(projectDir, ".forja"), "testing", {});
    await writeText(projectDir, "forja.yaml", "version: 1\nharnesses:\n  - opencode\n");

    const first = await runSync(deps(), { paths: paths(), mode: "apply" });
    expect(first.aborted).toBe(false);
    expect(
      await filesystem.exists(path.join(projectDir, ".agents", "skills", "testing", "SKILL.md")),
    ).toBe(true);

    const second = await runSync(deps(), { paths: paths(), mode: "apply" });
    expect(second.plan.changes).toBe(0);
  });

  it("preserves manual content with CRLF line endings", async () => {
    await writeSkill(path.join(projectDir, ".forja"), "testing", {});
    await writeText(
      projectDir,
      "forja.yaml",
      "version: 1\nharnesses:\n  - opencode\nverification:\n  check: make check\n  verify: make verify\n",
    );
    await filesystem.writeFile(
      path.join(projectDir, "AGENTS.md"),
      "# Manual\r\n\r\nKeep me.\r\n",
    );

    await runSync(deps(), { paths: paths(), mode: "apply" });

    const agentsMd = await filesystem.readFile(path.join(projectDir, "AGENTS.md"));
    expect(agentsMd).toContain("# Manual");
    expect(agentsMd).toContain("Keep me.");
    expect(agentsMd).toContain("<!-- forja:begin -->");
  });

  it("writes generated files with LF line endings", async () => {
    await writeSkill(path.join(projectDir, ".forja"), "testing", {});
    await writeText(projectDir, "forja.yaml", "version: 1\nharnesses:\n  - opencode\n");
    await runSync(deps(), { paths: paths(), mode: "apply" });

    const skill = await filesystem.readFile(
      path.join(projectDir, ".agents", "skills", "testing", "SKILL.md"),
    );
    expect(skill.includes("\r\n")).toBe(false);
  });
});
