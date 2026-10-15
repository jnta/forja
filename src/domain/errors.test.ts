import { describe, expect, it } from "vitest";

import { ForjaError, isForjaError } from "./errors";

describe("ForjaError", () => {
  it("carries a stable code and defaults to an internal kind", () => {
    const error = new ForjaError("boom", "FORJA-CLI-001");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ForjaError");
    expect(error.code).toBe("FORJA-CLI-001");
    expect(error.kind).toBe("internal");
    expect(error.resolution).toBeUndefined();
  });

  it("preserves kind, resolution and cause", () => {
    const cause = new Error("root cause");
    const error = new ForjaError("bad input", "FORJA-CLI-002", {
      kind: "usage",
      resolution: "Run `forja --help`.",
      cause,
    });

    expect(error.kind).toBe("usage");
    expect(error.resolution).toBe("Run `forja --help`.");
    expect(error.cause).toBe(cause);
  });

  it("is detectable through the type guard", () => {
    expect(isForjaError(new ForjaError("x", "FORJA-CLI-003"))).toBe(true);
    expect(isForjaError(new Error("x"))).toBe(false);
    expect(isForjaError("x")).toBe(false);
  });
});
