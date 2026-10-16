import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { initProject, type InitDeps } from "./init";

const filesystem = new NodeFilesystem();
let projectDir: string;
let globalDir: string;

beforeEach(async () => {
  projectDir = await createTempDir();
  globalDir = path.join(projectDir, "global");
});

afterEach(async () => {
  await removeTempDir(projectDir);
});

function deps(): InitDeps {
  return { filesystem, yaml: new YamlParser() };
}

function baseOptions(scope: "project" | "global" = "project") {
  return {
    scope,
    projectDir,
    globalDir,
    homeDir: filesystem.homeDir(),
    harnesses: ["opencode", "codex"],
    packs: ["core-engineering"],
    verification: { fast: "make check", full: "make verify" },
  };
}

describe("initProject", () => {
  it("creates forja.yaml and gitignores forja.local.yaml", async () => {
    const result = await initProject(deps(), baseOptions());

    expect(result.created).toContain(path.join(projectDir, "forja.yaml"));
    const config = await filesystem.readFile(path.join(projectDir, "forja.yaml"));
    expect(config).toContain("version: 1");
    expect(config).toContain("opencode:");
    expect(config).toContain("packs:");
    expect(config).toContain("make check");

    const gitignore = await filesystem.readFile(path.join(projectDir, ".gitignore"));
    expect(gitignore).toContain("forja.local.yaml");
  });

  it("is safe to run repeatedly", async () => {
    await initProject(deps(), baseOptions());
    const second = await initProject(deps(), baseOptions());

    expect(second.created).toEqual([]);
    expect(second.preserved).toContain(path.join(projectDir, "forja.yaml"));
  });

  it("preserves an existing configuration without --force", async () => {
    await writeText(projectDir, "forja.yaml", "version: 1\nskills:\n  - custom\n");
    const result = await initProject(deps(), baseOptions());

    expect(result.preserved).toContain(path.join(projectDir, "forja.yaml"));
    expect(await filesystem.readFile(path.join(projectDir, "forja.yaml"))).toContain(
      "custom",
    );
  });

  it("overwrites with --force", async () => {
    await writeText(projectDir, "forja.yaml", "version: 1\nskills:\n  - custom\n");
    await initProject(deps(), { ...baseOptions(), force: true });

    const config = await filesystem.readFile(path.join(projectDir, "forja.yaml"));
    expect(config).not.toContain("custom");
    expect(config).toContain("opencode:");
  });

  it("initializes the global configuration", async () => {
    const result = await initProject(deps(), baseOptions("global"));

    const file = path.join(globalDir, "config.yaml");
    expect(result.created).toContain(file);
    const config = await filesystem.readFile(file);
    expect(config).toContain("defaultHarnesses:");
    expect(config).toContain("opencode");
  });

  it("suggests packs from detected stacks without installing them", async () => {
    await writeText(projectDir, "package.json", "{}\n");
    const result = await initProject(deps(), baseOptions());

    expect(result.stacks.map((stack) => stack.id)).toContain("node");
    expect(result.suggestedPacks).toContain("typescript");
    const config = await filesystem.readFile(path.join(projectDir, "forja.yaml"));
    expect(config).not.toContain("typescript");
  });
});
