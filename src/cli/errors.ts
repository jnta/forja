import { ForjaError, isForjaError } from "@/domain/errors";

export interface FormatErrorOptions {
  /** Include the underlying cause (used with `--debug`). */
  readonly debug?: boolean;
}

/** Render a `ForjaError` as code + message + suggested fix (PRD 81). */
export function formatForjaError(
  error: ForjaError,
  options: FormatErrorOptions = {},
): string {
  const lines = [`error: ${error.message} (${error.code})`];
  if (options.debug && error.cause instanceof Error) {
    lines.push(`  cause: ${error.cause.message}`);
  }
  if (error.resolution) lines.push(`  fix: ${error.resolution}`);
  return `${lines.join("\n")}\n`;
}

/** Render any unexpected failure without leaking a stack to normal users. */
export function formatUnexpectedError(
  error: unknown,
  options: FormatErrorOptions = {},
): string {
  if (isForjaError(error)) return formatForjaError(error, options);
  if (error instanceof Error) return `error: ${error.message}\n`;
  return `error: ${String(error)}\n`;
}
