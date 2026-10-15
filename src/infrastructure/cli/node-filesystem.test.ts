import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NodeFilesystem } from "./node-filesystem";
import { createTempDir, removeTempDir } from "@/test/helpers";

describe("NodeFilesystem", () => {
  const filesystem = new NodeFilesystem();
  let directory: string;

  beforeEach(async () => {
    directory = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it("reports cwd, home and resolves absolute paths", () => {
    const target = filesystem.resolve(directory, "nested", "file.txt");

    expect(filesystem.cwd()).toBe(process.cwd());
    expect(filesystem.homeDir().length).toBeGreaterThan(0);
    expect(target).toBe(path.resolve(directory, "nested/file.txt"));
  });

  it("writes, reads and stats files", async () => {
    const file = filesystem.resolve(directory, "note.txt");
    await filesystem.writeFile(file, "hello");

    expect(await filesystem.readFile(file)).toBe("hello");
    expect(await filesystem.exists(file)).toBe(true);
    expect(await filesystem.stat(file)).toMatchObject({ type: "file", size: 5 });
  });

  it("returns null for missing paths without throwing", async () => {
    const missing = filesystem.resolve(directory, "missing.txt");

    expect(await filesystem.exists(missing)).toBe(false);
    expect(await filesystem.stat(missing)).toBeNull();
  });

  it("creates directories, lists entries and removes recursively", async () => {
    const nested = filesystem.resolve(directory, "a", "b");
    await filesystem.mkdir(nested, { recursive: true });
    await filesystem.writeFile(
      filesystem.resolve(directory, "a", "file.txt"),
      "x",
    );

    expect(await filesystem.stat(nested)).toMatchObject({ type: "directory" });
    expect(
      (await filesystem.readDir(filesystem.resolve(directory, "a"))).sort(),
    ).toEqual(["b", "file.txt"]);

    await filesystem.remove(filesystem.resolve(directory, "a"), {
      recursive: true,
    });
    expect(await filesystem.exists(filesystem.resolve(directory, "a"))).toBe(
      false,
    );
  });
});
