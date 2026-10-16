import { describe, expect, it } from "vitest";

import { resolveScope } from "./scope";

describe("resolveScope", () => {
  it("loads project and global libraries in project scope", () => {
    const result = resolveScope({
      scope: "project",
      projectDir: "/work/app",
      globalDir: "/home/u/.forja",
      homeDir: "/home/u",
    });
    expect(result.scope).toBe("project");
    expect(result.libraryPaths).toEqual({
      projectDir: "/work/app",
      globalDir: "/home/u/.forja",
    });
    expect(result.outputRoot).toBe("/work/app");
  });

  it("loads only the global library and writes into home in global scope", () => {
    const result = resolveScope({
      scope: "global",
      projectDir: "/work/app",
      globalDir: "/home/u/.forja",
      homeDir: "/home/u",
    });
    expect(result.scope).toBe("global");
    expect(result.libraryPaths).toEqual({
      projectDir: "/home/u/.forja",
      globalDir: "/home/u/.forja",
    });
    expect(result.outputRoot).toBe("/home/u");
  });
});
