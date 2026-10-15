import path from "node:path";

import type { Diagnostic } from "@/domain/diagnostics";
import type { FilesystemPort } from "@/domain/filesystem";
import type {
  SyncAction,
  SyncConflict,
  SyncState,
} from "@/domain/sync";

import { CODES, makeDiagnostic } from "../library/diagnostics";
import { unifiedDiff } from "./diff";
import { hashContents } from "./hash";

export interface DesiredArtifact {
  /** Absolute target path. */
  readonly path: string;
  readonly kind: string;
  readonly contents: string;
  readonly harness: string;
  readonly source: string;
  /** Merges into an existing file by replacing a managed block. */
  readonly merge?: boolean;
}

export interface PlanEntry {
  /** Project-relative POSIX path. */
  readonly path: string;
  readonly action: SyncAction;
  readonly harness: string;
  readonly source: string;
  readonly desired?: string;
  readonly current?: string;
  readonly desiredHash?: string;
  readonly diff?: string;
}

export interface SyncPlan {
  readonly entries: readonly PlanEntry[];
  readonly conflicts: readonly SyncConflict[];
  readonly diagnostics: readonly Diagnostic[];
  readonly changes: number;
}

export interface PlanInput {
  readonly filesystem: FilesystemPort;
  readonly projectDir: string;
  readonly artifacts: readonly DesiredArtifact[];
  readonly state: SyncState;
}

function toRelative(projectDir: string, absolute: string): string | null {
  const relative = path.relative(projectDir, absolute);
  if (
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative.split(/[\\/]/).some((segment) => segment === "..")
  ) {
    return null;
  }
  return relative.split(path.sep).join("/");
}

function mergeSources(artifacts: readonly DesiredArtifact[]): {
  harness: string;
  source: string;
} {
  const harnesses = [...new Set(artifacts.map((artifact) => artifact.harness))].sort();
  const sources = [...new Set(artifacts.map((artifact) => artifact.source))].sort();
  return { harness: harnesses.join(","), source: sources.join(",") };
}

/** Compute the desired changes without writing anything (PRD 20–22, 43–44). */
export async function planSync(input: PlanInput): Promise<SyncPlan> {
  const { filesystem, projectDir, artifacts, state } = input;
  const diagnostics: Diagnostic[] = [];
  const conflicts: SyncConflict[] = [];
  const entries: PlanEntry[] = [];

  const groups = new Map<string, DesiredArtifact[]>();
  for (const artifact of artifacts) {
    const relative = toRelative(projectDir, artifact.path);
    if (relative === null) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.unsafeArtifactPath,
          message: `artifact "${artifact.path}" escapes the project directory`,
        }),
      );
      continue;
    }
    const bucket = groups.get(relative);
    if (bucket) bucket.push(artifact);
    else groups.set(relative, [artifact]);
  }

  for (const relative of [...groups.keys()].sort()) {
    const group = groups.get(relative) ?? [];
    const hashes = new Set(group.map((artifact) => hashContents(artifact.contents)));
    const { harness, source } = mergeSources(group);

    if (hashes.size > 1) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.adapterMismatch,
          message: `adapters disagree on "${relative}"`,
          resolution: "Only one adapter may own a generated path with differing bytes.",
        }),
      );
      conflicts.push({
        path: relative,
        reason: "adapter-mismatch",
        harness,
        source,
      });
      continue;
    }

    const desired = group[0].contents;
    const desiredHash = hashContents(desired);
    const target = filesystem.resolve(projectDir, relative);
    const exists = await filesystem.exists(target);
    const current = exists ? await filesystem.readFile(target) : undefined;
    const currentHash = current === undefined ? undefined : hashContents(current);
    const previous = state.managedFiles[relative];

    let action: SyncAction;
    if (!exists) {
      action = "create";
    } else if (currentHash === desiredHash) {
      action = "unchanged";
    } else if (previous && previous.hash === currentHash) {
      action = "update";
    } else if (previous) {
      action = "conflict";
      conflicts.push({
        path: relative,
        reason: "modified-managed",
        harness,
        source,
        current,
        desired,
      });
    } else if (group.some((artifact) => artifact.merge)) {
      // A managed-block artifact already incorporates the current manual
      // content, so adopting an unowned file does not overwrite it.
      action = "update";
    } else {
      action = "conflict";
      conflicts.push({
        path: relative,
        reason: "unmanaged-collision",
        harness,
        source,
        current,
        desired,
      });
    }

    entries.push({
      path: relative,
      action,
      harness,
      source,
      desired,
      current,
      desiredHash,
      diff:
        action === "update" || action === "conflict"
          ? unifiedDiff(relative, current ?? "", desired)
          : undefined,
    });
  }

  for (const relative of Object.keys(state.managedFiles).sort()) {
    if (groups.has(relative)) continue;
    const managed = state.managedFiles[relative];
    const target = filesystem.resolve(projectDir, relative);
    if (!(await filesystem.exists(target))) continue;
    const current = await filesystem.readFile(target);
    const currentHash = hashContents(current);

    if (currentHash === managed.hash) {
      entries.push({
        path: relative,
        action: "delete",
        harness: managed.harness,
        source: managed.source,
        current,
      });
    } else {
      conflicts.push({
        path: relative,
        reason: "stale-modified",
        harness: managed.harness,
        source: managed.source,
        current,
      });
      entries.push({
        path: relative,
        action: "conflict",
        harness: managed.harness,
        source: managed.source,
        current,
      });
    }
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  const changes = entries.filter((entry) => entry.action !== "unchanged").length;
  return { entries, conflicts, diagnostics, changes };
}
