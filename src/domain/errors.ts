/**
 * Error conventions for Forja.
 *
 * User-facing failures are thrown as `ForjaError` so the presentation layer can
 * render a stable code, the cause and a suggested fix, then map the failure to
 * a documented exit code. See docs/decisions/0001-cli-foundation.md.
 */
export type ForjaErrorKind =
  | "usage"
  | "config"
  | "conflict"
  | "network"
  | "internal";

export interface ForjaErrorOptions {
  /** Category used to derive the process exit code. Defaults to `internal`. */
  readonly kind?: ForjaErrorKind;
  /** Original cause, preserved for logging. */
  readonly cause?: unknown;
  /** Suggested resolution shown to the user. */
  readonly resolution?: string;
}

export class ForjaError extends Error {
  /** Stable identifier, e.g. `FORJA-CLI-002`. */
  readonly code: string;
  readonly kind: ForjaErrorKind;
  readonly resolution?: string;

  constructor(message: string, code: string, options: ForjaErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ForjaError";
    this.code = code;
    this.kind = options.kind ?? "internal";
    this.resolution = options.resolution;
  }
}

export function isForjaError(value: unknown): value is ForjaError {
  return value instanceof ForjaError;
}
