import { z } from "zod";

import type { Diagnostic } from "@/domain/diagnostics";
import { SYNC_STATE_VERSION, type SyncState } from "@/domain/sync";

import { CODES, makeDiagnostic } from "../library/diagnostics";

const managedSchema = z.object({
  hash: z.string().min(1),
  source: z.string(),
  harness: z.string(),
});

const stateSchema = z.object({
  version: z.number().int(),
  managedFiles: z.record(z.string(), managedSchema).default({}),
});

export function serializeState(state: SyncState): Record<string, unknown> {
  const managedFiles: Record<string, unknown> = {};
  for (const path of Object.keys(state.managedFiles).sort()) {
    const entry = state.managedFiles[path];
    managedFiles[path] = {
      hash: entry.hash,
      source: entry.source,
      harness: entry.harness,
    };
  }
  return { version: state.version, managedFiles };
}

export function parseState(
  raw: unknown,
  source: string,
  diagnostics: Diagnostic[],
): SyncState | null {
  const result = stateSchema.safeParse(raw);
  if (!result.success) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.stateInvalid,
        message: `invalid sync state: ${result.error.issues[0]?.message ?? "invalid"}`,
        file: source,
      }),
    );
    return null;
  }
  if (result.data.version !== SYNC_STATE_VERSION) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.unsupportedVersion,
        message: `unsupported sync state version ${result.data.version}; expected ${SYNC_STATE_VERSION}`,
        file: source,
        field: "version",
      }),
    );
    return null;
  }
  return { version: result.data.version, managedFiles: result.data.managedFiles };
}
