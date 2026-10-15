import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SyncState } from "@/domain/sync";
import { emptyState } from "@/domain/sync";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { CODES } from "../library/diagnostics";
import { hashContents } from "./hash";
import { planSync, type DesiredArtifact } from "./planner";

const filesystem = new NodeFilesystem();
let projectDir: string;

beforeEach(async () => {
  projectDir = await createTempDir();
});

afterEach(async () => {
  await removeTempDir(projectDir);
});

function artifact(relative: string, contents: string, harness = "fixture"): DesiredArtifact {
  return {
    path: path.join(projectDir, relative),
    kind: "instructions",
    contents,
    harness,
    source: `instructions:${path.basename(relative)}`,
  };
}

function managed(relative: string, contents: string): SyncState {
  return {
    version: 1,
    managedFiles: {
      [relative]: {
        hash: hashContents(contents),
        source: `instructions:${path.basename(relative)}`,
        harness: "fixture",
      },
    },
  };
}

function plan(artifacts: DesiredArtifact[], state: SyncState = emptyState()) {
  return planSync({ filesystem, projectDir, artifacts, state });
}

describe("planSync", () => {
  it("plans a create for a new file", async () => {
    const result = await plan([artifact("new.txt", "hello")]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].action).toBe("create");
    expect(result.changes).toBe(1);
    expect(result.conflicts).toEqual([]);
  });

  it("plans unchanged when content matches", async () => {
    await writeText(projectDir, "a.txt", "same");
    const result = await plan([artifact("a.txt", "same")], managed("a.txt", "same"));
    expect(result.entries[0].action).toBe("unchanged");
    expect(result.changes).toBe(0);
  });

  it("plans a safe update when the managed file is unmodified", async () => {
    await writeText(projectDir, "a.txt", "old");
    const result = await plan([artifact("a.txt", "new")], managed("a.txt", "old"));
    expect(result.entries[0].action).toBe("update");
    expect(result.entries[0].diff).toContain("+new");
  });

  it("conflicts when a managed file was edited", async () => {
    await writeText(projectDir, "a.txt", "edited");
    const result = await plan([artifact("a.txt", "new")], managed("a.txt", "old"));
    expect(result.entries[0].action).toBe("conflict");
    expect(result.conflicts[0].reason).toBe("modified-managed");
  });

  it("conflicts on an unmanaged collision", async () => {
    await writeText(projectDir, "a.txt", "manual");
    const result = await plan([artifact("a.txt", "generated")]);
    expect(result.conflicts[0].reason).toBe("unmanaged-collision");
  });

  it("deletes stale owned and unmodified files only", async () => {
    await writeText(projectDir, "stale.txt", "old");
    await writeText(projectDir, "edited.txt", "manual edit");
    const state: SyncState = {
      version: 1,
      managedFiles: {
        "stale.txt": { hash: hashContents("old"), source: "s", harness: "fixture" },
        "edited.txt": { hash: hashContents("generated"), source: "s", harness: "fixture" },
      },
    };

    const result = await plan([], state);

    const stale = result.entries.find((entry) => entry.path === "stale.txt");
    const edited = result.entries.find((entry) => entry.path === "edited.txt");
    expect(stale?.action).toBe("delete");
    expect(edited?.action).toBe("conflict");
    expect(result.conflicts.some((c) => c.reason === "stale-modified")).toBe(true);
  });

  it("deduplicates identical overlapping artifacts", async () => {
    const result = await plan([
      artifact("shared.txt", "same", "a"),
      artifact("shared.txt", "same", "b"),
    ]);
    expect(result.entries).toHaveLength(1);
    expect(result.conflicts).toEqual([]);
    expect(result.entries[0].harness).toBe("a,b");
  });

  it("rejects overlapping artifacts with differing bytes", async () => {
    const result = await plan([
      artifact("shared.txt", "one", "a"),
      artifact("shared.txt", "two", "b"),
    ]);
    expect(result.diagnostics.map((d) => d.code)).toContain(CODES.adapterMismatch);
    expect(result.conflicts[0].reason).toBe("adapter-mismatch");
  });

  it("rejects artifacts that escape the project", async () => {
    const result = await plan([
      {
        path: path.resolve(projectDir, "..", "outside.txt"),
        kind: "instructions",
        contents: "x",
        harness: "fixture",
        source: "s",
      },
    ]);
    expect(result.diagnostics.map((d) => d.code)).toContain(CODES.unsafeArtifactPath);
    expect(result.entries).toEqual([]);
  });
});
