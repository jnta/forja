import type { ComponentKind } from "./references";

/** Current `forja.lock` schema version. */
export const LOCKFILE_VERSION = 1;

export interface LockEntry {
  readonly kind: ComponentKind;
  readonly name: string;
  readonly version: string;
  /** Canonical source string, e.g. `github:owner/repo#v1.2.0`. */
  readonly source: string;
  /** `sha256-<base64>` content digest. */
  readonly integrity: string;
  /** Immutable Git commit when applicable. */
  readonly commit?: string;
  /** Resolved dependencies, formatted as `kind:name@version`. */
  readonly dependencies: readonly string[];
}

export interface Lockfile {
  readonly lockfileVersion: number;
  readonly entries: readonly LockEntry[];
}

export function formatLockedRef(entry: LockEntry): string {
  return `${entry.kind}:${entry.name}@${entry.version}`;
}
