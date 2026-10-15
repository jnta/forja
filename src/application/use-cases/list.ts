import type { ForjaConfig, HarnessEntry } from "@/domain/config";
import type { Diagnostic } from "@/domain/diagnostics";

import {
  loadLibrary,
  type LibraryPaths,
  type LoadLibraryDeps,
} from "../library/load";

export interface LibraryItem {
  readonly id: string;
  readonly description: string;
}

export interface ListResult {
  readonly harnesses: readonly HarnessEntry[];
  readonly skills: readonly LibraryItem[];
  readonly agents: readonly LibraryItem[];
  readonly workflows: readonly LibraryItem[];
  readonly policies: readonly LibraryItem[];
  readonly packs: readonly LibraryItem[];
  readonly config: ForjaConfig;
  readonly diagnostics: readonly Diagnostic[];
}

/** List the components available in the global and project libraries. */
export async function listLibrary(
  deps: LoadLibraryDeps,
  paths: LibraryPaths,
): Promise<ListResult> {
  const { ir, config, diagnostics } = await loadLibrary(deps, paths);
  return {
    harnesses: config.harnesses,
    skills: ir.skills.map(({ id, description }) => ({ id, description })),
    agents: ir.agents.map(({ id, description }) => ({ id, description })),
    workflows: ir.workflows.map(({ id, description }) => ({ id, description })),
    policies: ir.policies.map(({ id, description }) => ({ id, description })),
    packs: ir.packs.map(({ id, description }) => ({ id, description })),
    config,
    diagnostics,
  };
}
