import { ForjaError, isForjaError } from "@/domain/errors";

/** Render a `ForjaError` as code + message + suggested fix (PRD 81). */
export function formatForjaError(error: ForjaError): string {
  const lines = [`error: ${error.message} (${error.code})`];
  if (error.resolution) lines.push(`  fix: ${error.resolution}`);
  return `${lines.join("\n")}\n`;
}

/** Render any unexpected failure without leaking a stack to normal users. */
export function formatUnexpectedError(error: unknown): string {
  if (isForjaError(error)) return formatForjaError(error);
  if (error instanceof Error) return `error: ${error.message}\n`;
  return `error: ${String(error)}\n`;
}
