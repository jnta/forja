import { describe, expect, it } from "vitest";

import { ForjaError } from "@/domain/errors";

import { formatForjaError, formatUnexpectedError } from "./errors";

describe("error formatting", () => {
  it("includes code and suggested fix", () => {
    const message = formatForjaError(
      new ForjaError("broken", "FORJA-CFG-001", { resolution: "fix it" }),
    );
    expect(message).toContain("error: broken (FORJA-CFG-001)");
    expect(message).toContain("fix: fix it");
    expect(message).not.toContain("cause:");
  });

  it("includes the cause only in debug mode", () => {
    const error = new ForjaError("broken", "FORJA-CFG-001", {
      cause: new Error("underlying"),
    });
    expect(formatForjaError(error)).not.toContain("cause:");
    expect(formatForjaError(error, { debug: true })).toContain("cause: underlying");
  });

  it("formats unexpected values", () => {
    expect(formatUnexpectedError(new Error("x"))).toBe("error: x\n");
    expect(formatUnexpectedError("x")).toBe("error: x\n");
  });
});
