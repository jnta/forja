import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import type { Diagnostic } from "@/domain/diagnostics";

import { ConsoleDiagnosticReporter, type ReporterLevel } from "./console-reporter";

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

const diagnostics: Diagnostic[] = [
  { code: "FORJA-CFG-001", severity: "error", message: "boom" },
  { code: "FORJA-CFG-002", severity: "warning", message: "careful" },
  { code: "FORJA-CFG-003", severity: "info", message: "note" },
];

describe("ConsoleDiagnosticReporter levels", () => {
  it.each([
    ["quiet", 1],
    ["normal", 2],
    ["verbose", 3],
    ["debug", 3],
  ] as Array<[ReporterLevel, number]>)("reports %i line(s) at %s", (level, count) => {
    const sink = capture();
    const reporter = new ConsoleDiagnosticReporter({ stream: sink.stream, level });
    reporter.reportAll(diagnostics);
    expect(sink.read().trim().split("\n").length).toBe(count);
  });

  it("renders code, message and fix", () => {
    const sink = capture();
    new ConsoleDiagnosticReporter({ stream: sink.stream, level: "normal" }).report({
      code: "FORJA-CFG-001",
      severity: "error",
      message: "boom",
      resolution: "do this",
    });
    expect(sink.read()).toContain("error FORJA-CFG-001: boom");
    expect(sink.read()).toContain("fix: do this");
  });
});
