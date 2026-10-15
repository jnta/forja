/**
 * Package source boundary (PRD 36–37).
 *
 * A source materializes a source *root* (a directory with the same layout as a
 * library root: `skills/`, `agents/`, `workflows/`, `policies/`, `packs/`) into
 * a staging directory. The resolver then enumerates packages from that root.
 * Sources never execute package scripts.
 */
import type { ComponentKind } from "./references";

export type SourceKind = "local" | "git" | "registry";

export interface SourceSpec {
  readonly kind: SourceKind;
  /** Path, Git URL or registry name. */
  readonly location: string;
  /** Optional subdirectory inside a Git repository. */
  readonly subpath?: string;
  /** Commit, tag or version range used to select content. */
  readonly selector?: string;
  /** Original user-facing string, recorded in the lockfile. */
  readonly raw: string;
}

export interface MaterializedSource {
  /** Directory containing the materialized source root. */
  readonly directory: string;
  /** Immutable commit when the source is Git-backed. */
  readonly commit?: string;
  /** Canonical source string recorded in the lockfile. */
  readonly source: string;
}

export interface SourcePackage {
  readonly kind: ComponentKind;
  readonly name: string;
  /** `0.0.0` for component kinds that do not carry a version. */
  readonly version: string;
  readonly directory: string;
}

export interface PackageSourcePort {
  readonly kind: SourceKind;
  canResolve(spec: SourceSpec): boolean;
  /** Materialize the source into `destination` (an empty staging directory). */
  materialize(
    spec: SourceSpec,
    destination: string,
  ): Promise<MaterializedSource>;
}
