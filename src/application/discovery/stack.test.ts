import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { discoverStack } from "./stack";

const filesystem = new NodeFilesystem();
let directory: string;

beforeEach(async () => {
  directory = await createTempDir();
});

afterEach(async () => {
  await removeTempDir(directory);
});

describe("discoverStack", () => {
  it("detects marker files and suggests packs", async () => {
    await writeText(directory, "package.json", "{}\n");
    await writeText(directory, "go.mod", "module x\n");

    const stacks = await discoverStack(filesystem, directory);
    expect(stacks.map((stack) => stack.id).sort()).toEqual(["go", "node"]);
    const node = stacks.find((stack) => stack.id === "node");
    expect(node?.files).toEqual(["package.json"]);
    expect(node?.suggestedPacks).toContain("typescript");
  });

  it("detects Maven and Gradle variants", async () => {
    await writeText(directory, "pom.xml", "<project/>\n");
    await writeText(directory, "build.gradle.kts", "\n");

    const ids = (await discoverStack(filesystem, directory)).map((stack) => stack.id);
    expect(ids).toContain("maven");
    expect(ids).toContain("gradle");
  });

  it("returns nothing for an empty directory", async () => {
    expect(await discoverStack(filesystem, directory)).toEqual([]);
  });

  it("resolves marker files relative to the directory", async () => {
    await writeText(directory, "pyproject.toml", "[project]\n");
    const stacks = await discoverStack(filesystem, path.join(directory));
    expect(stacks[0].id).toBe("python");
  });
});
