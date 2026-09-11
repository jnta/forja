// @vitest-environment node
import type { Part } from "@opencode-ai/sdk";
import { describe, expect, it } from "vitest";

import { extractText } from "./text";

describe("extractText", () => {
  it("joins text parts and ignores other part types", () => {
    const parts = [
      { type: "reasoning", text: "ignore me" },
      { type: "text", text: "hello" },
      { type: "text", text: "world" },
    ] as unknown as Part[];

    expect(extractText(parts)).toBe("hello\nworld");
  });

  it("returns an empty string when there is no text", () => {
    expect(extractText([])).toBe("");
  });
});
