import path from "node:path";

import type { Diagnostic } from "@/domain/diagnostics";
import type { FilesystemPort } from "@/domain/filesystem";
import type { ConflictChoice, SyncState } from "@/domain/sync";

import { CODES, makeDiagnostic } from "../library/diagnostics";
import { hashContents } from "./hash";
import type { PlanEntry, SyncPlan } from "./planner";
import { serializeState } from "./state";

const LOCK_NAME = "sync.lock";
const TEMP_SUFFIX = ".forja-tmp";

function isExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "EEXIST"
  );
}

export interface ResolveConflictsInput {
  readonly plan: SyncPlan;
  readonly choices?: ReadonlyMap<string, ConflictChoice>;
  /** Explicit scoped flag: overwrite all conflicts. */
  readonly overwrite?: boolean;
  /** Explicit scoped flag: keep all conflicting files. */
  readonly keepLocal?: boolean;
}

export interface ConflictResolution {
  readonly aborted: boolean;
  readonly decisions: ReadonlyMap<string, ConflictChoice>;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Decide what to do with each conflict. Noninteractive callers abort unless an
 * explicit choice or scoped flag is supplied (PRD 44).
 */
export function resolveConflicts(
  input: ResolveConflictsInput,
): ConflictResolution {
  const decisions = new Map<string, ConflictChoice>();
  const diagnostics: Diagnostic[] = [];

  for (const conflict of input.plan.conflicts) {
    const explicit = input.choices?.get(conflict.path);
    const choice: ConflictChoice =
      explicit ??
      (input.overwrite ? "overwrite" : input.keepLocal ? "keep" : "abort");

    if (conflict.reason === "adapter-mismatch" || choice === "abort" || choice === "diff") {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.syncAborted,
          severity: "warning",
          message: `conflict on "${conflict.path}" (${conflict.reason}) was not resolved`,
          resolution:
            "Re-run interactively, or pass --overwrite / --keep-local explicitly.",
        }),
      );
      return { aborted: true, decisions, diagnostics };
    }

    decisions.set(conflict.path, choice);
  }

  return { aborted: false, decisions, diagnostics };
}

export interface ApplyInput {
  readonly filesystem: FilesystemPort;
  readonly projectDir: string;
  readonly plan: SyncPlan;
  readonly previousState: SyncState;
  readonly decisions: ReadonlyMap<string, ConflictChoice>;
}

export interface ApplyResult {
  readonly applied: number;
  readonly deleted: number;
  readonly drift: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly state: SyncState;
  readonly aborted: boolean;
}

async function writeAtomic(
  filesystem: FilesystemPort,
  target: string,
  contents: string,
): Promise<void> {
  const temp = `${target}${TEMP_SUFFIX}`;
  await filesystem.mkdir(path.dirname(target), { recursive: true });
  await filesystem.writeFile(temp, contents);
  try {
    await filesystem.rename(temp, target);
  } catch (error) {
    await filesystem.remove(temp, { force: true });
    throw error;
  }
}

/**
 * Apply a resolved plan transactionally. Writes are atomic (temp + rename) and
 * the previous state/content is restored if anything fails, so manual content
 * is never lost. A directory lock prevents concurrent runs from corrupting
 * state.
 */
export async function applySync(input: ApplyInput): Promise<ApplyResult> {
  const { filesystem, projectDir, plan, previousState, decisions } = input;
  const diagnostics: Diagnostic[] = [];
  const drift: string[] = [];

  const lockDir = filesystem.resolve(projectDir, ".forja", LOCK_NAME);
  await filesystem.mkdir(filesystem.resolve(projectDir, ".forja"), {
    recursive: true,
  });
  try {
    await filesystem.mkdir(lockDir, { recursive: false });
  } catch (error) {
    if (isExistsError(error)) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.syncConcurrency,
          message: "another Forja sync is already running for this project",
          resolution: "Wait for it to finish and try again.",
        }),
      );
      return {
        applied: 0,
        deleted: 0,
        drift,
        diagnostics,
        state: previousState,
        aborted: true,
      };
    }
    throw error;
  }

  const managed = { ...previousState.managedFiles };
  const backups = new Map<string, string | null>();
  let applied = 0;
  let deleted = 0;

  const backup = async (target: string): Promise<void> => {
    if (backups.has(target)) return;
    backups.set(
      target,
      (await filesystem.exists(target)) ? await filesystem.readFile(target) : null,
    );
  };

  try {
    for (const entry of plan.entries) {
      if (entry.action === "unchanged") {
        if (entry.desiredHash) {
          managed[entry.path] = {
            hash: entry.desiredHash,
            source: entry.source,
            harness: entry.harness,
          };
        }
        continue;
      }

      if (entry.action === "conflict") {
        const decision = decisions.get(entry.path);
        if (decision === "overwrite" && entry.desired !== undefined && entry.desiredHash) {
          const target = filesystem.resolve(projectDir, entry.path);
          await backup(target);
          await writeAtomic(filesystem, target, entry.desired);
          managed[entry.path] = {
            hash: entry.desiredHash,
            source: entry.source,
            harness: entry.harness,
          };
          applied += 1;
        } else {
          // keep-local (or unmanaged collision): preserve the file and report drift.
          drift.push(entry.path);
        }
        continue;
      }

      if (entry.action === "delete") {
        const target = filesystem.resolve(projectDir, entry.path);
        await backup(target);
        await filesystem.remove(target, { force: true });
        delete managed[entry.path];
        deleted += 1;
        continue;
      }

      // create | update
      if (entry.desired === undefined || entry.desiredHash === undefined) continue;
      const target = filesystem.resolve(projectDir, entry.path);
      await backup(target);
      await writeAtomic(filesystem, target, entry.desired);
      managed[entry.path] = {
        hash: entry.desiredHash,
        source: entry.source,
        harness: entry.harness,
      };
      applied += 1;
    }

    const stateTarget = filesystem.resolve(projectDir, ".forja", "state.json");
    await backup(stateTarget);
    const nextState: SyncState = { version: previousState.version, managedFiles: managed };
    await writeAtomic(filesystem, stateTarget, JSON.stringify(serializeState(nextState), null, 2) + "\n");
  } catch (error) {
    for (const [target, content] of backups) {
      if (content === null) await filesystem.remove(target, { force: true });
      else await filesystem.writeFile(target, content);
    }
    diagnostics.push(
      makeDiagnostic({
        code: CODES.syncRecovery,
        message: `sync failed and was rolled back: ${(error as Error).message}`,
        resolution: "No generated file was changed; review the error and retry.",
      }),
    );
    await filesystem.remove(lockDir, { recursive: true, force: true });
    return {
      applied: 0,
      deleted: 0,
      drift,
      diagnostics,
      state: previousState,
      aborted: true,
    };
  }

  await filesystem.remove(lockDir, { recursive: true, force: true });
  return {
    applied,
    deleted,
    drift,
    diagnostics,
    state: { version: previousState.version, managedFiles: managed },
    aborted: false,
  };
}

/** Content hash helper re-exported for callers that build artifacts. */
export { hashContents };

export type { PlanEntry };
