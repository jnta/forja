/**
 * Component reference vocabulary.
 *
 * A reference names a Forja component and an optional version range, written as
 * `name@range` in user configuration (for example `testing@^2`).
 */
export type ComponentKind = "skill" | "agent" | "workflow" | "policy" | "pack";

export interface ComponentRef {
  readonly kind: ComponentKind;
  readonly name: string;
  /** Semver range, tag or `*`. Absent for unpinned references. */
  readonly range?: string;
}

export function formatComponentRef(ref: ComponentRef): string {
  return ref.range === undefined ? ref.name : `${ref.name}@${ref.range}`;
}
