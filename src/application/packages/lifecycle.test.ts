import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalSource } from "@/infrastructure/sources/local-source";
import { FilesystemContentCache } from "@/infrastructure/cache/content-cache";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { parseSourceSpec } from "@/application/resolve/source-spec";
import type { SourceBinding } from "@/application/resolve/resolver";
import { writePack, writeSkill } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { addPackage, type PackageDeps } from "./add";
import { removePackage } from "./remove";
import { outdatedPackages } from "./outdated";
import { updatePackages } from "./update";

const filesystem = new NodeFilesystem();
const yaml = new YamlParser();
let workspace: string;
let projectDir: string;
let globalDir: string;
let stagingRoot: string;
let counter = 0;

beforeEach(async () => {
  workspace = await createTempDir();
  projectDir = path.join(workspace, "project");
  globalDir = path.join(workspace, "global");
  stagingRoot = path.join(workspace, "staging");
  await mkdir(projectDir, { recursive: true });
  await mkdir(globalDir, { recursive: true });
});

afterEach(async () => {
  await removeTempDir(workspace);
});

function createSources(sources: readonly string[]): readonly SourceBinding[] {
  return sources.flatMap((raw) => {
    const parsed = parseSourceSpec(raw);
    if (!parsed.ok) return [];
    return [{ spec: parsed.spec, port: new LocalSource(filesystem) }];
  });
}

function deps(): PackageDeps {
  return {
    filesystem,
    yaml,
    cache: new FilesystemContentCache(path.join(globalDir, "cache")),
    createSources,
    stagingRoot,
  };
}

function paths() {
  return {
    scope: "project" as const,
    projectDir,
    globalDir,
    homeDir: filesystem.homeDir(),
  };
}

async function registry(setup: (root: string) => Promise<void>): Promise<string> {
  const root = path.join(workspace, `registry-${counter++}`);
  await mkdir(root, { recursive: true });
  await setup(root);
  return root;
}

async function writeConfig(sources: readonly string[], skills: readonly string[] = []): Promise<void> {
  const config: Record<string, unknown> = { version: 1, sources: [...sources] };
  if (skills.length > 0) config.skills = [...skills];
  await filesystem.writeFile(
    path.join(projectDir, "forja.yaml"),
    yaml.stringify(config),
  );
}

const libraryRoot = () => path.join(projectDir, ".forja");
const lockFile = () => path.join(projectDir, "forja.lock");

describe("package lifecycle — add", () => {
  it("adds a skill from a source, installs it and locks it", async () => {
    const reg = await registry((root) => writeSkill(root, "testing", { metadata: "version: 1.0.0" }));
    await writeConfig([`local:${reg}`]);

    const result = await addPackage(deps(), { ...paths(), input: "testing", consent: { allow: true } });

    expect(result.aborted).toBe(false);
    expect(await filesystem.exists(path.join(libraryRoot(), "skills", "testing", "SKILL.md"))).toBe(true);
    expect(await filesystem.readFile(path.join(projectDir, "forja.yaml"))).toContain("testing");
    const lock = await filesystem.readFile(lockFile());
    expect(lock).toContain("testing");
    expect(lock).toContain("1.0.0");
  });

  it("resolves nested packs and their dependencies", async () => {
    const reg = await registry(async (root) => {
      await writeSkill(root, "testing", { metadata: "version: 1.0.0" });
      await writePack(root, "core", "version: 1.0.0\nskills:\n  - testing@^1\n");
    });
    await writeConfig([`local:${reg}`]);

    const result = await addPackage(deps(), {
      ...paths(),
      input: "core",
      kind: "pack",
      consent: { allow: true },
    });

    expect(result.aborted).toBe(false);
    expect(await filesystem.exists(path.join(libraryRoot(), "packs", "core.yaml"))).toBe(true);
    expect(await filesystem.exists(path.join(libraryRoot(), "skills", "testing", "SKILL.md"))).toBe(true);
    const lock = await filesystem.readFile(lockFile());
    expect(lock).toContain("core");
    expect(lock).toContain("testing");
  });

  it("leaves state unchanged when the source is unavailable", async () => {
    await writeConfig(["local:/does/not/exist"]);

    const result = await addPackage(deps(), { ...paths(), input: "ghost", consent: { allow: true } });

    expect(result.aborted).toBe(true);
    expect(await filesystem.readFile(path.join(projectDir, "forja.yaml"))).not.toContain("skills");
    expect(await filesystem.exists(lockFile())).toBe(false);
    expect(await filesystem.exists(path.join(libraryRoot(), "skills", "ghost"))).toBe(false);
  });
});

describe("package lifecycle — remove", () => {
  it("retains dependencies referenced elsewhere and prunes the rest", async () => {
    const reg = await registry(async (root) => {
      await writeSkill(root, "testing", { metadata: "version: 1.0.0" });
      await writePack(root, "core", "version: 1.0.0\nskills:\n  - testing@^1\n");
    });
    await writeConfig([`local:${reg}`], ["testing@^1"]);
    await addPackage(deps(), { ...paths(), input: "core", kind: "pack", consent: { allow: true } });

    const removeSkill = await removePackage(deps(), { ...paths(), name: "testing", kind: "skill" });
    expect(removeSkill.removed).toEqual([]);
    expect(await filesystem.exists(path.join(libraryRoot(), "skills", "testing"))).toBe(true);

    const removePack = await removePackage(deps(), { ...paths(), name: "core", kind: "pack" });
    expect(removePack.removed).toContain("skill:testing");
    expect(await filesystem.exists(path.join(libraryRoot(), "skills", "testing"))).toBe(false);
  });

  it("never removes local definitions that are not managed", async () => {
    const reg = await registry((root) => writeSkill(root, "testing", { metadata: "version: 1.0.0" }));
    await writeConfig([`local:${reg}`], ["testing@^1"]);
    await addPackage(deps(), { ...paths(), input: "testing", consent: { allow: true } });
    await writeSkill(libraryRoot(), "local-one", {});

    await removePackage(deps(), { ...paths(), name: "testing", kind: "skill" });

    expect(await filesystem.exists(path.join(libraryRoot(), "skills", "local-one", "SKILL.md"))).toBe(true);
  });
});

describe("package lifecycle — outdated and update", () => {
  async function twoVersions(): Promise<{ one: string; two: string }> {
    const one = await registry((root) => writeSkill(root, "testing", { metadata: "version: 1.0.0", body: "# v1\n" }));
    const two = await registry((root) => writeSkill(root, "testing", { metadata: "version: 2.0.0", body: "# v2\n" }));
    return { one, two };
  }

  it("reports current, wanted and latest versions", async () => {
    const { one, two } = await twoVersions();
    await writeConfig([`local:${one}`, `local:${two}`], ["testing@^1"]);
    await addPackage(deps(), { ...paths(), input: "testing@^1", consent: { allow: true } });

    const result = await outdatedPackages(deps(), paths());
    const row = result.rows.find((entry) => entry.name === "testing");
    expect(row).toMatchObject({ current: "1.0.0", wanted: "1.0.0", latest: "2.0.0", status: "outdated" });
  });

  it("reports unavailable metadata distinctly", async () => {
    await writeConfig(["local:/does/not/exist"], ["ghost"]);
    const result = await outdatedPackages(deps(), paths());
    expect(result.unavailableSources).toContain("local:/does/not/exist");
    expect(result.rows[0]).toMatchObject({ name: "ghost", status: "unavailable" });
  });

  it("previews updates without writing and applies them", async () => {
    const { one, two } = await twoVersions();
    await writeConfig([`local:${one}`, `local:${two}`], ["testing@^1"]);
    await addPackage(deps(), { ...paths(), input: "testing@^1", consent: { allow: true } });
    // Loosen the range so a newer version becomes wanted.
    await writeConfig([`local:${one}`, `local:${two}`], ["testing"]);
    const beforeLock = await filesystem.readFile(lockFile());

    const preview = await updatePackages(deps(), { ...paths(), dryRun: true });
    expect(preview.changes).toEqual([{ kind: "skill", name: "testing", from: "1.0.0", to: "2.0.0" }]);
    expect(preview.applied).toBe(false);
    expect(await filesystem.readFile(lockFile())).toBe(beforeLock);

    const applied = await updatePackages(deps(), { ...paths(), consent: { allow: true } });
    expect(applied.applied).toBe(true);
    expect(await filesystem.readFile(lockFile())).toContain("2.0.0");
    expect(await filesystem.readFile(path.join(libraryRoot(), "skills", "testing", "SKILL.md"))).toContain("v2");
  });

  it("protects exact version pins", async () => {
    const { one, two } = await twoVersions();
    await writeConfig([`local:${one}`, `local:${two}`], ["testing@1.0.0"]);
    await addPackage(deps(), { ...paths(), input: "testing@1.0.0", consent: { allow: true } });

    const result = await updatePackages(deps(), { ...paths(), consent: { allow: true } });
    expect(result.pinned).toContain("skill:testing");
    expect(result.changes).toEqual([]);
  });

  it("skips major versions beyond the configured range", async () => {
    const { one, two } = await twoVersions();
    await writeConfig([`local:${one}`, `local:${two}`], ["testing@^1"]);
    await addPackage(deps(), { ...paths(), input: "testing@^1", consent: { allow: true } });

    const result = await updatePackages(deps(), { ...paths(), consent: { allow: true } });
    expect(result.changes).toEqual([]);
    expect(result.skippedMajor).toEqual([
      { kind: "skill", name: "testing", current: "1.0.0", wanted: "1.0.0", latest: "2.0.0" },
    ]);
  });

  it("updates only the selected target", async () => {
    const one = await registry(async (root) => {
      await writeSkill(root, "testing", { metadata: "version: 1.0.0" });
      await writeSkill(root, "java", { metadata: "version: 1.0.0" });
    });
    const two = await registry(async (root) => {
      await writeSkill(root, "testing", { metadata: "version: 2.0.0" });
      await writeSkill(root, "java", { metadata: "version: 1.1.0" });
    });
    await writeConfig([`local:${one}`, `local:${two}`], ["testing@1.0.0", "java@1.0.0"]);
    await addPackage(deps(), { ...paths(), input: "testing@1.0.0", consent: { allow: true } });
    await addPackage(deps(), { ...paths(), input: "java@1.0.0", consent: { allow: true } });
    await writeConfig([`local:${one}`, `local:${two}`], ["testing", "java"]);

    const result = await updatePackages(deps(), { ...paths(), target: "java", dryRun: true });
    expect(result.changes.map((change) => change.name)).toEqual(["java"]);
  });
});
