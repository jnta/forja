/**
 * Managed output lifecycle (PRD 43–44).
 *
 * Forja records ownership metadata for every file it generates so it can tell
 * a safe update apart from a user modification. Unknown ownership is never
 * permission to overwrite.
 */
export const SYNC_STATE_VERSION = 1;

export interface ManagedFile {
  /** `sha256-<hex>` of the content Forja last generated. */
  readonly hash: string;
  /** Origin of the artifact, e.g. `agent:reviewer`. */
  readonly source: string;
  /** Adapter id that owns the artifact. */
  readonly harness: string;
}

export interface SyncState {
  readonly version: number;
  readonly managedFiles: Readonly<Record<string, ManagedFile>>;
}

export type SyncAction = "create" | "update" | "unchanged" | "delete" | "conflict";

export type ConflictChoice = "overwrite" | "keep" | "abort" | "diff";

export type ConflictReason =
  | "modified-managed"
  | "unmanaged-collision"
  | "stale-modified"
  | "adapter-mismatch";

export interface SyncConflict {
  /** Project-relative POSIX path. */
  readonly path: string;
  readonly reason: ConflictReason;
  readonly harness: string;
  readonly source: string;
  readonly current?: string;
  readonly desired?: string;
}

export function emptyState(): SyncState {
  return { version: SYNC_STATE_VERSION, managedFiles: {} };
}
