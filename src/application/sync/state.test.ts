import { describe, expect, it } from "vitest";

import type { Diagnostic } from "@/domain/diagnostics";
import { emptyState } from "@/domain/sync";

import { CODES } from "../library/diagnostics";
import { parseState, serializeState } from "./state";

describe("sync state", () => {
  it("round-trips and sorts entries", () => {
    const state = {
      version: 1,
      managedFiles: {
        "b.txt": { hash: "sha256-b", source: "agent:b", harness: "opencode" },
        "a.txt": { hash: "sha256-a", source: "agent:a", harness: "opencode" },
      },
    };
    const diagnostics: Diagnostic[] = [];
    const parsed = parseState(serializeState(state), "state.json", diagnostics);

    expect(diagnostics).toEqual([]);
    expect(parsed).toEqual(state);
    expect(Object.keys(serializeState(state).managedFiles as object)).toEqual([
      "a.txt",
      "b.txt",
    ]);
  });

  it("rejects unsupported versions", () => {
    const diagnostics: Diagnostic[] = [];
    const parsed = parseState(
      { version: 99, managedFiles: {} },
      "state.json",
      diagnostics,
    );
    expect(parsed).toBeNull();
    expect(diagnostics.map((d) => d.code)).toContain(CODES.unsupportedVersion);
  });

  it("rejects malformed state", () => {
    const diagnostics: Diagnostic[] = [];
    const parsed = parseState({ version: 1, managedFiles: { x: {} } }, "s", diagnostics);
    expect(parsed).toBeNull();
    expect(diagnostics.map((d) => d.code)).toContain(CODES.stateInvalid);
  });

  it("emptyState is empty", () => {
    expect(emptyState().managedFiles).toEqual({});
  });
});
