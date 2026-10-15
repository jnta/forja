import { mkdir } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { OpenCodeCompilerAdapter } from "@/infrastructure/adapters/portability/opencode/opencode-adapter";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import {
  harnessInfo,
  listHarnesses,
  setHarnessEnabled,
  type HarnessDeps,
} from "./harness";

const filesystem = new NodeFilesystem();
let projectDir: string;
let globalDir: string;

beforeEach(async () => {
  projectDir = await createTempDir();
  globalDir = path.join(projectDir, "global");
  await mkdir(globalDir, { recursive: true });
});

afterEach(async () => {
  await removeTempDir(projectDir);
});

function deps(): HarnessDeps {
  return { filesystem, yaml: new YamlParser() };
}

function adapters() {
  return [new OpenCodeCompilerAdapter({ filesystem })];
}

function paths() {
  return { projectDir, globalDir };
}

describe("harness management", () => {
  it("lists adapters as enabled by default", async () => {
    const listings = await listHarnesses(deps(), adapters(), paths());
    expect(listings).toEqual([
      {
        id: "opencode",
        enabled: true,
        installed: false,
        evidence: expect.stringContaining("no OpenCode configuration"),
      },
    ]);
  });

  it("enables and disables a harness while preserving other configuration", async () => {
    await writeText(
      projectDir,
      "forja.yaml",
      "version: 1\nverification:\n  check: make check\n  verify: make verify\n",
    );

    await setHarnessEnabled(deps(), paths(), "opencode", false);
    const disabled = await filesystem.readFile(path.join(projectDir, "forja.yaml"));
    expect(disabled).toContain("verification:");
    expect(disabled).toContain("check: make check");
    expect(disabled).toMatch(/harnesses:\s*\n\s*opencode:\s*\n\s*enabled: false/);

    expect((await listHarnesses(deps(), adapters(), paths()))[0].enabled).toBe(false);

    await setHarnessEnabled(deps(), paths(), "opencode", true);
    expect((await listHarnesses(deps(), adapters(), paths()))[0].enabled).toBe(true);
  });

  it("creates forja.yaml when it does not exist", async () => {
    await setHarnessEnabled(deps(), paths(), "opencode", true);
    const source = await filesystem.readFile(path.join(projectDir, "forja.yaml"));
    expect(source).toContain("harnesses:");
    expect(source).toContain("opencode:");
  });

  it("returns null for an unknown harness", async () => {
    expect(await harnessInfo(deps(), adapters(), paths(), "unknown")).toBeNull();
  });

  it("reports harness info", async () => {
    const info = await harnessInfo(deps(), adapters(), paths(), "opencode");
    expect(info?.listing.id).toBe("opencode");
    expect(info?.state.id).toBe("opencode");
  });
});
