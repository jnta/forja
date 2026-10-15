import path from "node:path";

import type { Diagnostic } from "@/domain/diagnostics";
import type { FilesystemPort } from "@/domain/filesystem";
import type { HarnessAdapterPort } from "@/domain/harness-adapter";
import type { ForjaIr } from "@/domain/ir";
import type { YamlParserPort } from "@/domain/serialization";
import { emptyState, type ConflictChoice, type SyncState } from "@/domain/sync";

import { loadLibrary, type LibraryPaths } from "../library/load";
import { CODES, makeDiagnostic } from "../library/diagnostics";
import { planSync, type DesiredArtifact, type SyncPlan } from "../sync/planner";
import { parseState } from "../sync/state";
import { applySync, resolveConflicts } from "../sync/writer";

export interface SyncDeps {
  readonly filesystem: FilesystemPort;
  readonly yaml: YamlParserPort;
  readonly adapters: readonly HarnessAdapterPort[];
}

export type SyncMode = "apply" | "dry-run" | "check";

export interface SyncOptions {
  readonly paths: LibraryPaths;
  readonly mode?: SyncMode;
  readonly overwrite?: boolean;
  readonly keepLocal?: boolean;
  readonly choices?: ReadonlyMap<string, ConflictChoice>;
}

export interface SyncReport {
  readonly plan: SyncPlan;
  readonly diagnostics: readonly Diagnostic[];
  readonly applied: number;
  readonly deleted: number;
  readonly drift: readonly string[];
  readonly aborted: boolean;
  readonly state: SyncState;
}

async function readState(
  filesystem: FilesystemPort,
  projectDir: string,
  diagnostics: Diagnostic[],
): Promise<SyncState> {
  const target = filesystem.resolve(projectDir, ".forja", "state.json");
  if (!(await filesystem.exists(target))) return emptyState();
  let raw: string;
  try {
    raw = await filesystem.readFile(target);
  } catch {
    return emptyState();
  }
  try {
    return parseState(JSON.parse(raw), target, diagnostics) ?? emptyState();
  } catch (error) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.stateInvalid,
        message: `invalid sync state JSON: ${(error as Error).message}`,
        file: target,
      }),
    );
    return emptyState();
  }
}

async function compileArtifacts(
  deps: SyncDeps,
  ir: ForjaIr,
  paths: LibraryPaths,
  diagnostics: Diagnostic[],
): Promise<DesiredArtifact[]> {
  const context = {
    projectDir: paths.projectDir,
    globalDir: paths.globalDir,
    homeDir: deps.filesystem.homeDir(),
  };
  const artifacts: DesiredArtifact[] = [];

  for (const adapter of deps.adapters) {
    const validation = await adapter.validate(ir, context);
    diagnostics.push(...validation);
    const generated = await adapter.compile(ir, context);
    for (const artifact of generated) {
      artifacts.push({
        path: artifact.path,
        kind: artifact.kind,
        contents: artifact.contents,
        harness: adapter.id,
        source: `${artifact.kind}:${path.basename(artifact.path)}`,
      });
    }
  }

  return artifacts;
}

/**
 * Load the library, compile enabled adapters, plan and (optionally) apply the
 * generated output. `dry-run` and `check` never write.
 */
export async function runSync(
  deps: SyncDeps,
  options: SyncOptions,
): Promise<SyncReport> {
  const mode = options.mode ?? "apply";
  const diagnostics: Diagnostic[] = [];

  const library = await loadLibrary(
    { filesystem: deps.filesystem, yaml: deps.yaml },
    options.paths,
  );
  diagnostics.push(...library.diagnostics);

  const previousState = await readState(deps.filesystem, options.paths.projectDir, diagnostics);
  const artifacts = await compileArtifacts(deps, library.ir, options.paths, diagnostics);
  const plan = await planSync({
    filesystem: deps.filesystem,
    projectDir: options.paths.projectDir,
    artifacts,
    state: previousState,
  });
  diagnostics.push(...plan.diagnostics);

  if (mode !== "apply") {
    return {
      plan,
      diagnostics,
      applied: 0,
      deleted: 0,
      drift: [],
      aborted: false,
      state: previousState,
    };
  }

  const resolution = resolveConflicts({
    plan,
    choices: options.choices,
    overwrite: options.overwrite,
    keepLocal: options.keepLocal,
  });
  diagnostics.push(...resolution.diagnostics);

  if (resolution.aborted) {
    return {
      plan,
      diagnostics,
      applied: 0,
      deleted: 0,
      drift: [],
      aborted: true,
      state: previousState,
    };
  }

  const result = await applySync({
    filesystem: deps.filesystem,
    projectDir: options.paths.projectDir,
    plan,
    previousState,
    decisions: resolution.decisions,
  });
  diagnostics.push(...result.diagnostics);

  return {
    plan,
    diagnostics,
    applied: result.applied,
    deleted: result.deleted,
    drift: result.drift,
    aborted: result.aborted,
    state: result.state,
  };
}
