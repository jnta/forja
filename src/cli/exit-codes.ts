import { isForjaError, type ForjaErrorKind } from "@/domain/errors";

/**
 * Stable process exit codes for the `forja` executable.
 * See docs/decisions/0001-cli-foundation.md.
 */
export const ExitCode = {
  Success: 0,
  Failure: 1,
  Usage: 2,
  Config: 3,
  Conflict: 4,
  /** `sync --check` found drift between desired and on-disk output. */
  Drift: 5,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

const KIND_TO_EXIT: Record<ForjaErrorKind, ExitCodeValue> = {
  usage: ExitCode.Usage,
  config: ExitCode.Config,
  conflict: ExitCode.Conflict,
  network: ExitCode.Failure,
  internal: ExitCode.Failure,
};

export function exitCodeFor(error: unknown): ExitCodeValue {
  if (isForjaError(error)) return KIND_TO_EXIT[error.kind];
  return ExitCode.Failure;
}

/**
 * Signal a specific exit code from a command without printing an extra error.
 * Used when a command already reported its own diagnostics (e.g. validate).
 */
export class CliExit extends Error {
  readonly code: ExitCodeValue;

  constructor(code: ExitCodeValue) {
    super(`command exited with code ${code}`);
    this.name = "CliExit";
    this.code = code;
  }
}

export function isCliExit(value: unknown): value is CliExit {
  return value instanceof CliExit;
}
