import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FilesystemPort } from "@/domain/filesystem";
import { OpenCodeCompilerAdapter } from "@/infrastructure/adapters/portability/opencode/opencode-adapter";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { writeSkill, writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { runDoctor, type DoctorDeps } from "./doctor";

const filesystem = new NodeFilesystem();
let projectDir: string;
let globalDir: string;

beforeEach(async () => {
  projectDir = await createTempDir();
  globalDir = path.join(projectDir, "global");
});

afterEach(async () => {
  await removeTempDir(projectDir);
});

function deps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    filesystem,
    yaml: new YamlParser(),
    adapters: [new OpenCodeCompilerAdapter({ filesystem })],
    nodeVersion: "v22.4.0",
    ...overrides,
  };
}

function options() {
  return { scope: "project" as const, projectDir, globalDir, homeDir: filesystem.homeDir() };
}

class ReadOnlyFilesystem implements FilesystemPort {
  constructor(private readonly base: FilesystemPort) {}
  cwd = () => this.base.cwd();
  homeDir = () => this.base.homeDir();
  resolve = (...segments: readonly string[]) => this.base.resolve(...segments);
  exists = (target: string) => this.base.exists(target);
  isWritable = () => Promise.resolve(false);
  stat = (target: string) => this.base.stat(target);
  realpath = (target: string) => this.base.realpath(target);
  readFile = (target: string) => this.base.readFile(target);
  readDir = (target: string) => this.base.readDir(target);
  mkdir = () => Promise.reject(new Error("doctor must not write"));
  rename = () => Promise.reject(new Error("doctor must not write"));
  copy = () => Promise.reject(new Error("doctor must not write"));
  remove = () => Promise.reject(new Error("doctor must not write"));
  writeFile = (): Promise<never> =>
    Promise.reject(new Error("doctor must not write"));
}

function check(report: Awaited<ReturnType<typeof runDoctor>>, id: string) {
  return report.checks.find((entry) => entry.id === id);
}

describe("runDoctor", () => {
  it("reports environment, harnesses, configuration and generated state", async () => {
    await writeSkill(path.join(projectDir, ".forja"), "testing", {});
    await writeText(projectDir, "forja.yaml", "version: 1\nharnesses:\n  - opencode\n");

    const report = await runDoctor(deps(), options());

    expect(check(report, "env.node")?.status).toBe("ok");
    expect(check(report, "env.git")?.status).toBe("warning");
    expect(check(report, "harness.opencode")?.status).toBe("warning");
    expect(check(report, "config")?.status).toBe("ok");
    expect(check(report, "generated")?.status).toBe("warning");
  });

  it("flags an unsupported Node version", async () => {
    const report = await runDoctor(deps({ nodeVersion: "v18.0.0" }), options());
    expect(check(report, "env.node")?.status).toBe("error");
    expect(report.healthy).toBe(false);
  });

  it("flags an unwritable home", async () => {
    const report = await runDoctor(
      deps({ filesystem: new ReadOnlyFilesystem(filesystem) }),
      options(),
    );
    expect(check(report, "env.home")?.status).toBe("error");
  });

  it("flags invalid configuration", async () => {
    await writeText(
      path.join(projectDir, ".forja"),
      "skills/broken/SKILL.md",
      "---\nname: broken\n",
    );
    const report = await runDoctor(deps(), options());
    expect(check(report, "config")?.status).toBe("error");
  });

  it("never writes while diagnosing", async () => {
    await writeText(projectDir, "forja.yaml", "version: 1\n");
    const report = await runDoctor(
      deps({ filesystem: new ReadOnlyFilesystem(filesystem) }),
      options(),
    );
    expect(report.checks.length).toBeGreaterThan(0);
  });
});
