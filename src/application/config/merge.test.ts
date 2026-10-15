import { describe, expect, it } from "vitest";

import type { Diagnostic } from "@/domain/diagnostics";

import { mergeConfig, type ConfigLayer } from "./merge";
import { CODES } from "../library/diagnostics";

function layer(
  scope: string,
  value: ConfigLayer["value"],
  source = scope,
): ConfigLayer {
  return { scope, source, value };
}

function merge(...layers: ConfigLayer[]) {
  const diagnostics: Diagnostic[] = [];
  return { config: mergeConfig(layers, diagnostics), diagnostics };
}

describe("mergeConfig — precedence", () => {
  it("applies defaults → global → packs → project → local", () => {
    const { config, diagnostics } = merge(
      layer("defaults", {}),
      layer("global", {
        harnesses: { opencode: { enabled: true } },
        skills: ["testing@^1", "global-only@^1"],
        verification: { check: "global check" },
      }),
      layer("packs", {
        harnesses: { opencode: { enabled: false }, codex: { enabled: true } },
        skills: ["testing@^2"],
      }),
      layer("project", {
        harnesses: { opencode: { enabled: true } },
        skills: ["testing@^3"],
        verification: { verify: "project verify" },
      }),
      layer("local", { skills: ["testing@^4"] }),
    );

    expect(diagnostics).toEqual([]);
    expect(config.harnesses).toEqual([
      { id: "codex", enabled: true },
      { id: "opencode", enabled: true },
    ]);
    expect(config.skills).toEqual([
      { kind: "skill", name: "global-only", range: "^1" },
      { kind: "skill", name: "testing", range: "^4" },
    ]);
    // Later layers win per verification slot and do not clear earlier slots.
    expect(config.verification).toEqual({
      fast: "global check",
      full: "project verify",
    });
  });

  it("never mutates the input layers", () => {
    const global = layer("global", { skills: ["testing@^1"] });
    const before = JSON.stringify(global);
    merge(global, layer("project", { skills: ["testing@^2"] }));
    expect(JSON.stringify(global)).toBe(before);
  });
});

describe("mergeConfig — normalization", () => {
  it("accepts harness lists and maps", () => {
    expect(merge(layer("global", { harnesses: ["a", "b"] })).config.harnesses).toEqual([
      { id: "a", enabled: true },
      { id: "b", enabled: true },
    ]);
    expect(
      merge(
        layer("global", {
          harnesses: { a: { enabled: false }, b: true, c: null },
        }),
      ).config.harnesses,
    ).toEqual([
      { id: "a", enabled: false },
      { id: "b", enabled: true },
      { id: "c", enabled: true },
    ]);
  });

  it("accepts dependency lists and maps", () => {
    const list = merge(layer("global", { skills: ["testing@^2"] })).config.skills;
    const map = merge(layer("global", { skills: { testing: "^2" } })).config.skills;
    expect(list).toEqual(map);
    expect(list).toEqual([{ kind: "skill", name: "testing", range: "^2" }]);
  });

  it("accepts fast/full, check/verify and quick/full aliases with command objects", () => {
    expect(
      merge(layer("global", { verification: { check: "make check", verify: "make verify" } }))
        .config.verification,
    ).toEqual({ fast: "make check", full: "make verify" });
    expect(
      merge(
        layer("global", {
          verification: { quick: { command: "make check" }, full: { command: "make verify" } },
        }),
      ).config.verification,
    ).toEqual({ fast: "make check", full: "make verify" });
    expect(
      merge(layer("global", { verification: { fast: "a", full: "b" } })).config.verification,
    ).toEqual({ fast: "a", full: "b" });
  });

  it("reports conflicting verification aliases", () => {
    const { config, diagnostics } = merge(
      layer("global", { verification: { check: "a", quick: "b" } }),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      CODES.conflictingVerification,
    );
    expect(config.verification).toEqual({ fast: "", full: "" });
  });

  it("rejects unsupported config versions", () => {
    const { diagnostics } = merge(layer("project", { version: 2 }));
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      CODES.unsupportedVersion,
    );
  });

  it("carries strict compatibility mode", () => {
    expect(merge(layer("global", { compatibility: { strict: true } })).config.strict).toBe(
      true,
    );
  });
});
