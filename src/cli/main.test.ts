import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { ForjaError } from "@/domain/errors";

import { ExitCode, exitCodeFor } from "./exit-codes";
import { runCli } from "./main";

function capture(): { stream: NodeJS.WritableStream; read: () => string } {
  let output = "";
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  return { stream, read: () => output };
}

async function run(argv: readonly string[], version = "1.2.3") {
  const stdout = capture();
  const stderr = capture();
  const code = await runCli({
    argv,
    version,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });
  return { code, stdout: stdout.read(), stderr: stderr.read() };
}

describe("runCli", () => {
  it("prints the injected version and exits successfully", async () => {
    const result = await run(["--version"]);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout.trim()).toBe("1.2.3");
  });

  it("prints help for --help", async () => {
    const result = await run(["--help"]);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain("Usage: forja");
    expect(result.stdout).toContain("Portable tooling for AI coding agents.");
  });

  it("prints help when invoked without arguments", async () => {
    const result = await run([]);
    expect(result.code).toBe(ExitCode.Success);
    expect(result.stdout).toContain("Usage: forja");
  });

  it("fails clearly on an unknown command with a usage exit code", async () => {
    const result = await run(["bogus"]);
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.stderr.toLowerCase()).toContain("unknown command");
    expect(result.stderr).toContain("bogus");
  });

  it("fails clearly on an unknown option", async () => {
    const result = await run(["--nope"]);
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

describe("exitCodeFor", () => {
  it("maps ForjaError kinds to the documented exit codes", () => {
    expect(exitCodeFor(new ForjaError("x", "FORJA-CLI-001", { kind: "usage" }))).toBe(2);
    expect(exitCodeFor(new ForjaError("x", "FORJA-CFG-001", { kind: "config" }))).toBe(3);
    expect(exitCodeFor(new ForjaError("x", "FORJA-SYNC-001", { kind: "conflict" }))).toBe(4);
    expect(exitCodeFor(new ForjaError("x", "FORJA-PKG-001", { kind: "network" }))).toBe(1);
    expect(exitCodeFor(new Error("x"))).toBe(1);
  });
});
