import { z } from "zod";

import type { Diagnostic } from "@/domain/diagnostics";
import { CODES, makeDiagnostic } from "@/domain/diagnostics";

export {
  CODES,
  makeDiagnostic,
  type DiagnosticInput,
} from "@/domain/diagnostics";

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
