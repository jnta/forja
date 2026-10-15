import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FilesystemPort, WriteFileOptions } from "@/domain/filesystem";
import type { SyncState } from "@/domain/sync";
import { emptyState } from "@/domain/sync";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { CODES } from "../library/diagnostics";
import { hashContents } from "./hash";
import { planSync, type DesiredArtifact } from "./planner";
import { applySync, resolveConflicts } from "./writer";

const filesystem = new NodeFilesystem();
let projectDir: string;

beforeEach(async () => {
  projectDir = await createTempDir();
});

afterEach(async () => {
  await removeTempDir(projectDir);
});

function artifact(relative: string, contents: string): DesiredArtifact {
  return {
    path: path.join(projectDir, relative),
    kind: "instructions",
    contents,
    harness: "fixture",
    source: `instructions:${relative}`,
  };
}

function managed(entries: Record<string, string>): SyncState {
  const managedFiles: Record<string, { hash: string; source: string; harness: string }> = {};
  for (const [relative, contents] of Object.entries(entries)) {
    managedFiles[relative] = {
      hash: hashContents(contents),
      source: `instructions:${relative}`,
      harness: "fixture",
    };
  }
  return { version: 1, managedFiles };
}

function plan(artifacts: DesiredArtifact[], state: SyncState) {
  return planSync({ filesystem, projectDir, artifacts, state });
}

/** Wraps the real filesystem and fails renames for a chosen target. */
class FailingFilesystem implements FilesystemPort {
  constructor(
    private readonly base: FilesystemPort,
    private readonly shouldFail: (target: string) => boolean,
  ) {}

  cwd = () => this.base.cwd();
  homeDir = () => this.base.homeDir();
  resolve = (...segments: readonly string[]) => this.base.resolve(...segments);
  exists = (target: string) => this.base.exists(target);
  stat = (target: string) => this.base.stat(target);
  realpath = (target: string) => this.base.realpath(target);
  readFile = (target: string) => this.base.readFile(target);
  readDir = (target: string) => this.base.readDir(target);
  mkdir = (target: string, options?: { recursive?: boolean }) =>
    this.base.mkdir(target, options);
  remove = (target: string, options?: { recursive?: boolean; force?: boolean }) =>
    this.base.remove(target, options);
  writeFile = (target: string, contents: string, options?: WriteFileOptions) =>
    this.base.writeFile(target, contents, options);
  rename = (from: string, to: string) => {
    if (this.shouldFail(to)) return Promise.reject(new Error("injected failure"));
    return this.base.rename(from, to);
  };
}

describe("applySync", () => {
  it("applies a create and records state so a second sync has no diff", async () => {
    const artifacts = [artifact("a.txt", "hello")];
    const first = await plan(artifacts, emptyState());
    const result = await applySync({
      filesystem,
      projectDir,
      plan: first,
      previousState: emptyState(),
      decisions: new Map(),
    });

    expect(result.aborted).toBe(false);
    expect(result.applied).toBe(1);
    expect(await filesystem.readFile(path.join(projectDir, "a.txt"))).toBe("hello");
    expect(result.state.managedFiles["a.txt"].hash).toBe(hashContents("hello"));

    const second = await plan(artifacts, result.state);
    expect(second.changes).toBe(0);
  });

  it("deletes stale owned files", async () => {
    await writeText(projectDir, "stale.txt", "old");
    const state = managed({ "stale.txt": "old" });
    const stalePlan = await plan([], state);
    const result = await applySync({
      filesystem,
      projectDir,
      plan: stalePlan,
      previousState: state,
      decisions: new Map(),
    });

    expect(result.deleted).toBe(1);
    expect(await filesystem.exists(path.join(projectDir, "stale.txt"))).toBe(false);
    expect(result.state.managedFiles["stale.txt"]).toBeUndefined();
  });

  it("overwrites a conflict only when explicitly selected", async () => {
    await writeText(projectDir, "a.txt", "edited");
    const state = managed({ "a.txt": "old" });
    const conflictPlan = await plan([artifact("a.txt", "new")], state);

    const abort = resolveConflicts({ plan: conflictPlan });
    expect(abort.aborted).toBe(true);

    const overwrite = resolveConflicts({ plan: conflictPlan, overwrite: true });
    const result = await applySync({
      filesystem,
      projectDir,
      plan: conflictPlan,
      previousState: state,
      decisions: overwrite.decisions,
    });
    expect(await filesystem.readFile(path.join(projectDir, "a.txt"))).toBe("new");
    expect(result.state.managedFiles["a.txt"].hash).toBe(hashContents("new"));
  });

  it("keeps local edits and reports unresolved drift", async () => {
    await writeText(projectDir, "a.txt", "edited");
    const state = managed({ "a.txt": "old" });
    const conflictPlan = await plan([artifact("a.txt", "new")], state);

    const keep = resolveConflicts({ plan: conflictPlan, keepLocal: true });
    const result = await applySync({
      filesystem,
      projectDir,
      plan: conflictPlan,
      previousState: state,
      decisions: keep.decisions,
    });

    expect(await filesystem.readFile(path.join(projectDir, "a.txt"))).toBe("edited");
    expect(result.drift).toContain("a.txt");
    expect(result.state.managedFiles["a.txt"].hash).toBe(hashContents("old"));
  });

  it("rolls back without losing manual content when a write fails", async () => {
    await writeText(projectDir, "a.txt", "old-a");
    await writeText(projectDir, "b.txt", "old-b");
    const state = managed({ "a.txt": "old-a", "b.txt": "old-b" });
    const writePlan = await plan(
      [artifact("a.txt", "new-a"), artifact("b.txt", "new-b")],
      state,
    );

    const failing = new FailingFilesystem(filesystem, (target) =>
      target.endsWith("b.txt"),
    );
    const result = await applySync({
      filesystem: failing,
      projectDir,
      plan: writePlan,
      previousState: state,
      decisions: new Map(),
    });

    expect(result.aborted).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toContain(CODES.syncRecovery);
    expect(await filesystem.readFile(path.join(projectDir, "a.txt"))).toBe("old-a");
    expect(await filesystem.readFile(path.join(projectDir, "b.txt"))).toBe("old-b");
    expect(await filesystem.exists(path.join(projectDir, ".forja", "sync.lock"))).toBe(
      false,
    );
  });

  it("refuses to run when another sync holds the lock", async () => {
    await filesystem.mkdir(path.join(projectDir, ".forja", "sync.lock"), {
      recursive: true,
    });
    const createPlan = await plan([artifact("a.txt", "hello")], emptyState());
    const result = await applySync({
      filesystem,
      projectDir,
      plan: createPlan,
      previousState: emptyState(),
      decisions: new Map(),
    });

    expect(result.aborted).toBe(true);
    expect(result.diagnostics.map((d) => d.code)).toContain(CODES.syncConcurrency);
    expect(await filesystem.exists(path.join(projectDir, "a.txt"))).toBe(false);

    await filesystem.remove(path.join(projectDir, ".forja", "sync.lock"), {
      recursive: true,
      force: true,
    });
    const retry = await applySync({
      filesystem,
      projectDir,
      plan: createPlan,
      previousState: emptyState(),
      decisions: new Map(),
    });
    expect(retry.aborted).toBe(false);
  });
});
