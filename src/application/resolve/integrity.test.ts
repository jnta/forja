import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { createSymlink, writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { hashPath } from "./integrity";

const filesystem = new NodeFilesystem();
let directory: string;

beforeEach(async () => {
  directory = await createTempDir();
});

afterEach(async () => {
  await removeTempDir(directory);
});

describe("hashPath", () => {
  it("is deterministic and sensitive to content", async () => {
    await writeText(directory, "a.txt", "hello");
    const first = await hashPath(filesystem, directory);
    const second = await hashPath(filesystem, directory);
    expect(first).toBe(second);
    expect(first.startsWith("sha256-")).toBe(true);

    await writeText(directory, "a.txt", "changed");
    expect(await hashPath(filesystem, directory)).not.toBe(first);
  });

  it("ignores symlinks so content cannot escape the package", async () => {
    await writeText(directory, "a.txt", "hello");
    const before = await hashPath(filesystem, directory);

    const outside = path.join(directory, "..", `outside-${path.basename(directory)}.txt`);
    await writeText(path.dirname(outside), path.basename(outside), "secret");
    await createSymlink(directory, "escape", outside);

    expect(await hashPath(filesystem, directory)).toBe(before);
  });
});
