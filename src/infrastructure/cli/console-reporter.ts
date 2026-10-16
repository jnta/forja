import type {
  Diagnostic,
  DiagnosticReporterPort,
  DiagnosticSeverity,
  ReporterLevel,
} from "@/domain/diagnostics";

const SEVERITY_LABEL: Record<DiagnosticSeverity, string> = {
  error: "error",
  warning: "warning",
  info: "info",
};

export type { ReporterLevel };

function included(level: ReporterLevel, severity: DiagnosticSeverity): boolean {
  switch (level) {
    case "quiet":
      return severity === "error";
    case "normal":
      return severity !== "info";
    case "verbose":
    case "debug":
      return true;
  }
}

function formatLocation(diagnostic: Diagnostic): string {
  const { location } = diagnostic;
  if (!location) return "";

  const parts = [location.file ?? "<unknown>"];
  if (location.line !== undefined) {
    parts.push(String(location.line));
    if (location.column !== undefined) parts.push(String(location.column));
  }
  if (location.field !== undefined) parts.push(location.field);
  return ` (${parts.join(":")})`;
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const label = SEVERITY_LABEL[diagnostic.severity];
  const lines = [
    `${label} ${diagnostic.code}: ${diagnostic.message}${formatLocation(diagnostic)}`,
  ];
  if (diagnostic.resolution) lines.push(`  fix: ${diagnostic.resolution}`);
  return `${lines.join("\n")}\n`;
}

export interface ConsoleReporterOptions {
  /** Destination stream. Defaults to `process.stderr`. */
  readonly stream?: NodeJS.WritableStream;
  /** Verbosity. `quiet` shows errors only; `verbose`/`debug` show info too. */
  readonly level?: ReporterLevel;
}

/** Writes diagnostics as plain, greppable text. */
export class ConsoleDiagnosticReporter implements DiagnosticReporterPort {
  private readonly stream: NodeJS.WritableStream;
  private readonly level: ReporterLevel;

  constructor(options: ConsoleReporterOptions = {}) {
    this.stream = options.stream ?? process.stderr;
    this.level = options.level ?? "normal";
  }

  report(diagnostic: Diagnostic): void {
    if (!included(this.level, diagnostic.severity)) return;
    this.stream.write(formatDiagnostic(diagnostic));
  }

  reportAll(diagnostics: readonly Diagnostic[]): void {
    for (const diagnostic of diagnostics) this.report(diagnostic);
  }
}
