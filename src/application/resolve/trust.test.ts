import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_TRUST_POLICY } from "@/domain/trust";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { writeSkill } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { assessRisk, evaluateTrust } from "./trust";

const filesystem = new NodeFilesystem();
let directory: string;

beforeEach(async () => {
  directory = await createTempDir();
});

afterEach(async () => {
  await removeTempDir(directory);
});

async function skillWithScripts() {
  await writeSkill(directory, "deploy", {
    body: "# Deploy\n\nSee https://example.com/docs for details.\n",
    files: { "scripts/run.sh": "#!/bin/sh\necho hi\n" },
  });
  return {
    kind: "skill" as const,
    name: "deploy",
    version: "1.0.0",
    directory: filesystem.resolve(directory, "skills", "deploy"),
    source: "local:./deploy",
  };
}

describe("assessRisk", () => {
  it("lists scripts and remote references", async () => {
    const summary = await assessRisk(filesystem, await skillWithScripts());

    expect(summary.package).toBe("skill:deploy@1.0.0");
    expect(summary.scripts).toEqual(["scripts/run.sh"]);
    expect(summary.remoteReferences).toEqual(["https://example.com/docs"]);
    expect(summary.unsigned).toBe(true);
  });
});

describe("evaluateTrust", () => {
  it("denies when the policy denies", async () => {
    const summary = await assessRisk(filesystem, await skillWithScripts());
    const evaluation = evaluateTrust(
      { ...DEFAULT_TRUST_POLICY, scripts: "deny" },
      [summary],
    );
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.denied).toEqual([summary]);
  });

  it("asks (fails closed) when a decision is required and no consent is given", async () => {
    const summary = await assessRisk(filesystem, await skillWithScripts());
    const evaluation = evaluateTrust(DEFAULT_TRUST_POLICY, [summary]);
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.requiresConfirmation).toEqual([summary]);
  });

  it("allows with explicit consent", async () => {
    const summary = await assessRisk(filesystem, await skillWithScripts());
    const evaluation = evaluateTrust(DEFAULT_TRUST_POLICY, [summary], {
      allow: true,
    });
    expect(evaluation.allowed).toBe(true);
  });

  it("allows packages without scripts or remote references", async () => {
    await writeSkill(directory, "plain", { body: "# Plain\n" });
    const summary = await assessRisk(filesystem, {
      kind: "skill",
      name: "plain",
      version: "1.0.0",
      directory: filesystem.resolve(directory, "skills", "plain"),
      source: "local:./plain",
    });
    expect(evaluateTrust(DEFAULT_TRUST_POLICY, [summary]).allowed).toBe(true);
  });
});
