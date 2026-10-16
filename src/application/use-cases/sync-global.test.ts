import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FilesystemPort, WriteFileOptions } from "@/domain/filesystem";
import { OpenCodeCompilerAdapter } from "@/infrastructure/adapters/portability/opencode/opencode-adapter";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { writeAgent, writeSkill, writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { runSync, type SyncDeps } from "./sync";

const filesystem = new NodeFilesystem();
let workspace: string;
let home: string;
let globalDir: string;

beforeEach(async () => {
  workspace = await createTempDir();
  home = path.join(workspace, "home");
  globalDir = path.join(home, ".forja");
  await mkdir(globalDir, { recursive: true });
});

afterEach(async () => {
  await removeTempDir(workspace);
});

/** Filesystem with an isolated home directory, so global sync stays in a temp dir. */
class HomeFilesystem implements FilesystemPort {
  constructor(
    private readonly base: FilesystemPort,
    private readonly isolatedHome: string,
  ) {}
  cwd = () => this.base.cwd();
  homeDir = () => this.isolatedHome;
  resolve = (...segments: readonly string[]) => this.base.resolve(...segments);
  exists = (target: string) => this.base.exists(target);
  isWritable = (target: string) => this.base.isWritable(target);
  stat = (target: string) => this.base.stat(target);
  realpath = (target: string) => this.base.realpath(target);
  readFile = (target: string) => this.base.readFile(target);
  readDir = (target: string) => this.base.readDir(target);
  mkdir = (target: string, options?: { recursive?: boolean }) =>
    this.base.mkdir(target, options);
  rename = (from: string, to: string) => this.base.rename(from, to);
  copy = (from: string, to: string) => this.base.copy(from, to);
  remove = (target: string, options?: { recursive?: boolean; force?: boolean }) =>
    this.base.remove(target, options);
  writeFile = (target: string, contents: string, options?: WriteFileOptions) =>
    this.base.writeFile(target, contents, options);
}

describe("global scope sync", () => {
  it("writes native global configuration and resyncs clean", async () => {
    const homeFs = new HomeFilesystem(filesystem, home);
    await writeSkill(globalDir, "testing", {});
    await writeAgent(globalDir, "implementer", {
      filesystem: "    read: true\n    write: true",
      shell: "    enabled: true\n    mutating: true",
      network: "true",
      body: "# Implementer\n",
    });
    await writeText(
      globalDir,
      "config.yaml",
      "defaultHarnesses:\n  - opencode\nverification:\n  check: make check\n  verify: make verify\n",
    );

    const deps: SyncDeps = {
      filesystem: homeFs,
      yaml: new YamlParser(),
      adapters: [new OpenCodeCompilerAdapter({ filesystem: homeFs })],
    };
    const paths = { projectDir: workspace, globalDir };

    const first = await runSync(deps, { paths, scope: "global", mode: "apply" });
    expect(first.aborted).toBe(false);
    expect(
      await homeFs.exists(path.join(home, ".config", "opencode", "agents", "implementer.md")),
    ).toBe(true);
    expect(
      await homeFs.exists(path.join(home, ".agents", "skills", "testing", "SKILL.md")),
    ).toBe(true);
    expect(await homeFs.exists(path.join(home, ".forja", "state.json"))).toBe(true);

    const second = await runSync(deps, { paths, scope: "global", mode: "apply" });
    expect(second.plan.changes).toBe(0);
  });
});
