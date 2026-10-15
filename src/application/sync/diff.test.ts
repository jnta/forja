import { describe, expect, it } from "vitest";

import { unifiedDiff } from "./diff";

describe("unifiedDiff", () => {
  it("returns empty for identical content", () => {
    expect(unifiedDiff("a.txt", "same\n", "same\n")).toBe("");
  });

  it("shows removed and added lines with a header", () => {
    const diff = unifiedDiff("a.txt", "old instruction\n", "new instruction\n");
    expect(diff).toContain("--- a/a.txt");
    expect(diff).toContain("+++ b/a.txt");
    expect(diff).toContain("-old instruction");
    expect(diff).toContain("+new instruction");
  });

  it("keeps unchanged lines as context", () => {
    const diff = unifiedDiff("a.txt", "keep\nold\n", "keep\nnew\n");
    expect(diff).toContain(" keep");
    expect(diff).toContain("-old");
    expect(diff).toContain("+new");
  });
});
