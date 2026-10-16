import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const cliDir = path.join(repoRoot, "packages", "cli");

let installDir: string;
let cliPath: string;
let tarball: string;

beforeAll(async () => {
  await execa("npm", ["run", "cli:build"], { cwd: repoRoot });
  const packed = await execa("npm", ["pack", "--json"], { cwd: cliDir });
  const filename = (JSON.parse(packed.stdout) as Array<{ filename: string }>)[0].filename;
  tarball = path.join(cliDir, filename);

  installDir = await mkdtemp(path.join(os.tmpdir(), "forja-install-"));
  await execa("npm", ["install", "--no-audit", "--no-fund", "--prefix", installDir, tarball]);
  cliPath = path.join(installDir, "node_modules", "@forja", "cli", "dist", "cli.js");
}, 240_000);

afterAll(async () => {
  if (installDir) await rm(installDir, { recursive: true, force: true });
  if (tarball) await rm(tarball, { force: true });
});

describe("installed tarball", () => {
  it("exposes the forja executable and runs the full lifecycle", async () => {
    const work = await mkdtemp(path.join(os.tmpdir(), "forja-lifecycle-"));
    try {
      const project = path.join(work, "project");
      const home = path.join(work, "home");
      const registry = path.join(work, "registry");
      await mkdir(path.join(registry, "skills", "testing"), { recursive: true });
      await mkdir(path.join(registry, "packs"), { recursive: true });
      await mkdir(project, { recursive: true });
      await mkdir(home, { recursive: true });

      await writeFile(
        path.join(registry, "skills", "testing", "SKILL.md"),
        "---\nname: testing\ndescription: Testing skill.\n---\n\n# Testing\n",
      );
      await writeFile(path.join(registry, "skills", "testing", "skill.yaml"), "version: 1.0.0\n");
      await writeFile(
        path.join(registry, "packs", "core.yaml"),
        "version: 1.0.0\nskills:\n  - testing@^1\n",
      );
      await writeFile(
        path.join(project, "forja.yaml"),
        `version: 1\nsources:\n  - local:${registry}\nharnesses:\n  - opencode\nverification:\n  check: make check\n  verify: make verify\n`,
      );

      const env = { ...process.env, HOME: home, FORJA_HOME: path.join(home, ".forja") };
      const run = (args: string[]) =>
        execa(process.execPath, [cliPath, ...args], { cwd: project, env, reject: false });

      const version = await run(["--version"]);
      expect(version.exitCode).toBe(0);
      expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);

      const init = await run(["init", "--yes"]);
      expect(init.exitCode).toBe(0);

      const add = await run(["add", "pack", "core"]);
      expect(add.exitCode).toBe(0);
      await expect(
        access(path.join(project, ".forja", "packs", "core.yaml")),
      ).resolves.toBeUndefined();

      for (const args of [["validate"], ["diff"], ["sync"], ["sync", "--check"], ["update"]]) {
        const result = await run(args);
        expect(result.exitCode, `${args.join(" ")}: ${result.stderr}`).toBe(0);
      }

      const remove = await run(["remove", "core", "--kind", "pack"]);
      expect(remove.exitCode).toBe(0);
      const resync = await run(["sync", "--check"]);
      expect(resync.exitCode).toBe(0);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
});
