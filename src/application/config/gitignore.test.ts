import { describe, expect, it } from "vitest";

import {
  appendGitIgnoreEntries,
  missingGitIgnoreEntries,
} from "./gitignore";

describe("gitignore helpers", () => {
  it("detects the missing local config entry", () => {
    expect(missingGitIgnoreEntries("node_modules\n")).toEqual([
      "forja.local.yaml",
    ]);
  });

  it("does not duplicate an existing entry", () => {
    const contents = "node_modules\nforja.local.yaml\n";
    expect(missingGitIgnoreEntries(contents)).toEqual([]);
    expect(appendGitIgnoreEntries(contents)).toBe(contents);
  });

  it("appends the entry once on a fresh file", () => {
    const updated = appendGitIgnoreEntries("node_modules\n");
    expect(updated).toContain("forja.local.yaml");
    expect(updated.endsWith("\n")).toBe(true);
    expect(appendGitIgnoreEntries(updated)).toBe(updated);
  });
});
