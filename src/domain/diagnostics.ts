/**
 * Structured diagnostics shared by validation, compilation and synchronization.
 *
 * Diagnostics are data, not exceptions: validators, resolvers and adapters
 * return them so callers can decide whether to continue, warn or fail.
 */
export type DiagnosticSeverity = "error" | "warning" | "info";

export interface DiagnosticLocation {
  /** Absolute or project-relative path the diagnostic refers to. */
  readonly file?: string;
  /** 1-based line number. */
  readonly line?: number;
  /** 1-based column number. */
  readonly column?: number;
  /** Field or mapping key inside the file. */
  readonly field?: string;
}

export interface Diagnostic {
  /** Stable code, e.g. `FORJA-CFG-001`. */
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly location?: DiagnosticLocation;
  /** Suggested resolution shown to the user. */
  readonly resolution?: string;
}

export interface DiagnosticReporterPort {
  report(diagnostic: Diagnostic): void;
  reportAll(diagnostics: readonly Diagnostic[]): void;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}
