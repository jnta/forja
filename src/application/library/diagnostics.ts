import { z } from "zod";

import type { Diagnostic, DiagnosticSeverity } from "@/domain/diagnostics";

/** Diagnostic codes used by the loading/validation layer. */
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

function fieldOf(base: string | undefined, path: readonly PropertyKey[]): string | undefined {
  const parts = [...(base ? [base] : []), ...path.map(String)];
  return parts.length > 0 ? parts.join(".") : undefined;
}

export function schemaToDiagnostics(
  error: z.ZodError,
  options: { readonly file: string; readonly code?: string; readonly baseField?: string },
): Diagnostic[] {
  return error.issues.map((issue) =>
    makeDiagnostic({
      code: options.code ?? CODES.invalidSchema,
      message: issue.message,
      file: options.file,
      field: fieldOf(options.baseField, issue.path),
    }),
  );
}
