import { describe, expect, it } from "vitest";

import type { Diagnostic } from "@/domain/diagnostics";
import type { Lockfile } from "@/domain/lockfile";

import { parseLockfile, serializeLockfile } from "./lockfile";
import { CODES } from "../library/diagnostics";

const lockfile: Lockfile = {
  lockfileVersion: 1,
  entries: [
    {
      kind: "pack",
      name: "core",
      version: "1.0.0",
      source: "registry:/tmp/registry",
      integrity: "sha256-def",
      dependencies: [],
    },
    {
      kind: "skill",
      name: "testing",
      version: "2.4.1",
      source: "github:forja-sh/skills#abc",
      integrity: "sha256-abc",
      commit: "abc",
      dependencies: ["skill:code-review@1.0.0"],
    },
  ],
};

describe("lockfile", () => {
  it("serializes grouped by kind and round-trips", () => {
    const serialized = serializeLockfile(lockfile);
    expect(Object.keys(serialized)).toEqual([
      "lockfileVersion",
      "skills",
      "packs",
    ]);

    const diagnostics: Diagnostic[] = [];
    const parsed = parseLockfile(serialized, "forja.lock", diagnostics);
    expect(diagnostics).toEqual([]);
    expect(parsed).toEqual(lockfile);
  });

  it("rejects unsupported lockfile versions", () => {
    const diagnostics: Diagnostic[] = [];
    const parsed = parseLockfile(
      { lockfileVersion: 99 },
      "forja.lock",
      diagnostics,
    );
    expect(parsed).toBeNull();
    expect(diagnostics.map((d) => d.code)).toContain(CODES.unsupportedVersion);
  });

  it("rejects malformed entries", () => {
    const diagnostics: Diagnostic[] = [];
    const parsed = parseLockfile(
      { lockfileVersion: 1, skills: { testing: { version: "1.0.0" } } },
      "forja.lock",
      diagnostics,
    );
    expect(parsed).toBeNull();
    expect(diagnostics.map((d) => d.code)).toContain(CODES.invalidSchema);
  });
});
