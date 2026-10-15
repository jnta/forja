import { describe, expect, it } from "vitest";

import { formatSource, parseSourceSpec } from "./source-spec";

function ok(raw: string) {
  const result = parseSourceSpec(raw);
  if (!result.ok) throw new Error(`expected ok: ${result.message}`);
  return result.spec;
}

describe("parseSourceSpec", () => {
  it("parses local paths", () => {
    expect(ok("./fixtures")).toMatchObject({ kind: "local", location: "./fixtures" });
    expect(ok("local:/abs/path")).toMatchObject({ kind: "local", location: "/abs/path" });
    expect(ok("/abs/path")).toMatchObject({ kind: "local", location: "/abs/path" });
  });

  it("parses GitHub sources with subpath and selector", () => {
    expect(ok("github:owner/repo")).toMatchObject({
      kind: "git",
      location: "https://github.com/owner/repo.git",
    });
    expect(ok("github:owner/repo/skills@^1")).toMatchObject({
      kind: "git",
      location: "https://github.com/owner/repo.git",
      subpath: "skills",
      selector: "^1",
    });
  });

  it("parses generic git sources", () => {
    expect(ok("git:https://example.com/x.git#abc123")).toMatchObject({
      kind: "git",
      location: "https://example.com/x.git",
      selector: "abc123",
    });
  });

  it("parses registry names", () => {
    expect(ok("registry:core")).toMatchObject({ kind: "registry", location: "core" });
    expect(ok("testing")).toMatchObject({ kind: "registry", location: "testing" });
  });

  it("rejects empty and unrecognized sources", () => {
    expect(parseSourceSpec("  ").ok).toBe(false);
    expect(parseSourceSpec("not a source!").ok).toBe(false);
  });

  it("formats canonical source strings", () => {
    expect(formatSource(ok("./fixtures"))).toBe("local:./fixtures");
    expect(formatSource(ok("github:owner/repo@^1"), "deadbeef")).toBe(
      "github:owner/repo#deadbeef",
    );
  });
});
