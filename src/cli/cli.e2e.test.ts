import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";
import { beforeAll, describe, expect, it } from "vitest";

import { createTempDir, removeTempDir } from "@/test/helpers";
import { writeSkill, writeText } from "@/test/library-fixtures";

/**
 * End-to-end checks that exercise the *built* executable as a subprocess, plus
 * the build/package boundary (see docs/decisions/0001-cli-foundation.md).
 */
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const cliDir = path.join(repoRoot, "packages", "cli");
const cliEntry = path.join(cliDir, "dist", "cli.js");

const FORBIDDEN_BUNDLE_TOKENS = [
  "@langchain/",
  "@opencode-ai/",
  "next/dist",
  "react-dom",
];

async function runBuiltCli(
  args: readonly string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
) {
  return execa(process.execPath, [cliEntry, ...args], {
    cwd: options.cwd ?? repoRoot,
    reject: false,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
}

async function withProject(
  setup: (projectDir: string, globalDir: string) => Promise<void>,
): Promise<void> {
  const directory = await createTempDir();
  try {
    const globalDir = path.join(directory, "global");
    await mkdir(globalDir, { recursive: true });
    await setup(directory, globalDir);
  } finally {
    await removeTempDir(directory);
  }
}

beforeAll(async () => {
  await execa("npm", ["run", "cli:build"], { cwd: repoRoot });
}, 180_000);

describe("built forja executable", () => {
  it("reports the package version", async () => {
    const rootPackage = JSON.parse(
      await readFile(path.join(repoRoot, "package.json"), "utf8"),
    ) as { version: string };

    const result = await runBuiltCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(rootPackage.version);
  });

  it("prints help on --help and with no arguments", async () => {
    for (const args of [["--help"], []]) {
      const result = await runBuiltCli(args);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage: forja");
    }
  });

  it("fails clearly on an invalid command", async () => {
    const result = await runBuiltCli(["bogus"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toLowerCase()).toContain("unknown command");
  });

  it("ships a self-contained bundle without the runtime stack", async () => {
    const bundle = await readFile(cliEntry, "utf8");

    expect(bundle.startsWith("#!/usr/bin/env node")).toBe(true);
    for (const token of FORBIDDEN_BUNDLE_TOKENS) {
      expect(bundle).not.toContain(token);
    }
  });

  it("packs only intended CLI assets", async () => {
    const result = await execa("npm", ["pack", "--dry-run", "--json"], {
      cwd: cliDir,
    });
    const report = JSON.parse(
      result.stdout.slice(result.stdout.indexOf("[")),
    ) as Array<{ files: Array<{ path: string }> }>;
    const paths = report[0].files.map((file) => file.path).sort();

    expect(paths).toContain("dist/cli.js");
    for (const file of paths) {
      expect(file === "package.json" || file.startsWith("dist/")).toBe(true);
    }
  });
});

describe("built forja commands", () => {
  it("validates a project library and exits 0", async () => {
    await withProject(async (projectDir, globalDir) => {
      await writeSkill(path.join(projectDir, ".forja"), "testing", {});
      await writeText(projectDir, "forja.yaml", "version: 1\nskills:\n  - testing\n");

      const result = await runBuiltCli(["validate"], {
        cwd: projectDir,
        env: { FORJA_HOME: globalDir },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Valid.");
    });
  });

  it("exits with the config code and reports diagnostics for an invalid library", async () => {
    await withProject(async (projectDir, globalDir) => {
      await writeText(
        path.join(projectDir, ".forja"),
        "skills/broken/SKILL.md",
        "---\nname: broken\n",
      );

      const result = await runBuiltCli(["validate"], {
        cwd: projectDir,
        env: { FORJA_HOME: globalDir },
      });

      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain("FORJA-CFG-003");
    });
  });

  it("lists components as JSON", async () => {
    await withProject(async (projectDir, globalDir) => {
      await writeSkill(path.join(projectDir, ".forja"), "testing", {});

      const result = await runBuiltCli(["list", "--json"], {
        cwd: projectDir,
        env: { FORJA_HOME: globalDir },
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        skills: Array<{ id: string }>;
      };
      expect(parsed.skills.map((skill) => skill.id)).toContain("testing");
    });
  });
});
