import type { LibraryPaths } from "./library/load";

export type Scope = "project" | "global";

export interface ScopeInput {
  readonly scope: Scope;
  readonly projectDir: string;
  readonly globalDir: string;
  readonly homeDir: string;
}

export interface ScopePaths {
  readonly scope: Scope;
  /** Library roots to load definitions and configuration from. */
  readonly libraryPaths: LibraryPaths;
  /** Root the sync writer owns and writes generated files under. */
  readonly outputRoot: string;
}

/**
 * Resolve project vs global scope. Global scope loads the personal library and
 * writes into the user's home directories (PRD 17, 75).
 */
export function resolveScope(input: ScopeInput): ScopePaths {
  if (input.scope === "global") {
    return {
      scope: "global",
      libraryPaths: { projectDir: input.globalDir, globalDir: input.globalDir },
      outputRoot: input.homeDir,
    };
  }
  return {
    scope: "project",
    libraryPaths: { projectDir: input.projectDir, globalDir: input.globalDir },
    outputRoot: input.projectDir,
  };
}
