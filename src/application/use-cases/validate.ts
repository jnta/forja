import type { Diagnostic } from "@/domain/diagnostics";
import { hasErrors } from "@/domain/diagnostics";
import type { ForjaConfig } from "@/domain/config";
import type { ForjaIr } from "@/domain/ir";

import {
  loadLibrary,
  type LibraryPaths,
  type LoadLibraryDeps,
} from "../library/load";

export interface LibrarySummary {
  readonly skills: number;
  readonly agents: number;
  readonly workflows: number;
  readonly policies: number;
  readonly packs: number;
}

export interface ValidateResult {
  readonly ir: ForjaIr;
  readonly config: ForjaConfig;
  readonly diagnostics: readonly Diagnostic[];
  readonly valid: boolean;
  readonly summary: LibrarySummary;
}

function summarize(ir: ForjaIr): LibrarySummary {
  return {
    skills: ir.skills.length,
    agents: ir.agents.length,
    workflows: ir.workflows.length,
    policies: ir.policies.length,
    packs: ir.packs.length,
  };
}

/** Validate the global and project libraries without writing anything. */
export async function validateLibrary(
  deps: LoadLibraryDeps,
  paths: LibraryPaths,
): Promise<ValidateResult> {
  const result = await loadLibrary(deps, paths);
  return {
    ir: result.ir,
    config: result.config,
    diagnostics: result.diagnostics,
    valid: !hasErrors(result.diagnostics),
    summary: summarize(result.ir),
  };
}
