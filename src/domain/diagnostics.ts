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

/** Stable diagnostic codes shared across layers. */
export const CODES = {
  invalidYaml: "FORJA-CFG-001",
  invalidSchema: "FORJA-CFG-002",
  invalidFrontmatter: "FORJA-CFG-003",
  missingFile: "FORJA-CFG-004",
  duplicateId: "FORJA-CFG-005",
  invalidName: "FORJA-CFG-006",
  missingReference: "FORJA-CFG-007",
  dependencyCycle: "FORJA-CFG-008",
  unsafePath: "FORJA-CFG-009",
  invalidVersion: "FORJA-CFG-010",
  conflictingVerification: "FORJA-CFG-011",
  configReferenceNotFound: "FORJA-CFG-012",
  unsupportedVersion: "FORJA-CFG-013",
  dependencyConflict: "FORJA-PKG-001",
  missingVersion: "FORJA-PKG-002",
  missingSource: "FORJA-PKG-003",
  missingLockfile: "FORJA-PKG-004",
  cacheMiss: "FORJA-PKG-005",
  integrityMismatch: "FORJA-PKG-006",
  untrusted: "FORJA-PKG-007",
  sourceEscape: "FORJA-PKG-008",
  sourceUnavailable: "FORJA-PKG-009",
  syncConflict: "FORJA-SYNC-001",
  syncAborted: "FORJA-SYNC-002",
  syncConcurrency: "FORJA-SYNC-003",
  syncRecovery: "FORJA-SYNC-004",
  adapterMismatch: "FORJA-SYNC-005",
  syncDrift: "FORJA-SYNC-006",
  unsafeArtifactPath: "FORJA-SYNC-007",
  stateInvalid: "FORJA-SYNC-008",
  compatDegraded: "FORJA-COMPAT-001",
  compatUnsupported: "FORJA-COMPAT-002",
} as const;

export interface DiagnosticInput {
  readonly code: string;
  readonly severity?: DiagnosticSeverity;
  readonly message: string;
  readonly file?: string;
  readonly field?: string;
  readonly line?: number;
  readonly column?: number;
  readonly resolution?: string;
}

export function makeDiagnostic(input: DiagnosticInput): Diagnostic {
  const hasLocation =
    input.file !== undefined ||
    input.field !== undefined ||
    input.line !== undefined ||
    input.column !== undefined;
  return {
    code: input.code,
    severity: input.severity ?? "error",
    message: input.message,
    location: hasLocation
      ? {
          file: input.file,
          field: input.field,
          line: input.line,
          column: input.column,
        }
      : undefined,
    resolution: input.resolution,
  };
}
