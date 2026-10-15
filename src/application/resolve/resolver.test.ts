import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { execa } from "execa";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Diagnostic } from "@/domain/diagnostics";
import type { ComponentRef } from "@/domain/references";
import { DEFAULT_TRUST_POLICY } from "@/domain/trust";
import { FilesystemContentCache } from "@/infrastructure/cache/content-cache";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { GitSource } from "@/infrastructure/sources/git-source";
import { RegistrySource } from "@/infrastructure/sources/registry-source";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";
import { CODES } from "@/application/library/diagnostics";
import { writeSkill, writeText } from "@/test/library-fixtures";
import { createTempDir, removeTempDir } from "@/test/helpers";

import { resolvePackages, type ResolveDeps, type SourceBinding } from "./resolver";

const filesystem = new NodeFilesystem();
const yaml = new YamlParser();

let workDir: string;
let stagingRoot: string;
let cacheDir: string;
let counter = 0;

beforeEach(async () => {
  workDir = await createTempDir();
  stagingRoot = path.join(workDir, "staging");
  cacheDir = path.join(workDir, "cache");
  await mkdir(stagingRoot, { recursive: true });
});

afterEach(async () => {
  await removeTempDir(workDir);
});

function deps(sources: SourceBinding[], cache = cacheDir): ResolveDeps {
  return {
    filesystem,
    yaml,
    sources,
    cache: new FilesystemContentCache(cache),
    stagingRoot,
  };
}

function registryBinding(name: string, root: string): SourceBinding {
  return {
    spec: { kind: "registry", location: name, raw: `registry:${name}` },
    port: new RegistrySource(root),
  };
}

function gitBinding(repo: string, selector?: string): SourceBinding {
  const raw = selector ? `git:${repo}#${selector}` : `git:${repo}`;
  return {
    spec: { kind: "git", location: repo, selector, raw },
    port: new GitSource(),
  };
}

async function makeRegistry(
  setup: (root: string) => Promise<void>,
): Promise<string> {
  const root = path.join(workDir, `registry-${counter++}`);
  await mkdir(root, { recursive: true });
  await setup(root);
  return root;
}

function skillRef(name: string, range?: string): ComponentRef {
  return { kind: "skill", name, range };
}

function codes(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => diagnostic.code);
}

describe("resolvePackages — version selection", () => {
  it("resolves ranges across sources and picks the highest match", async () => {
    const one = await makeRegistry((root) =>
      writeSkill(root, "testing", { metadata: "version: 1.0.0" }),
    );
    const two = await makeRegistry((root) =>
      writeSkill(root, "testing", { metadata: "version: 2.0.0" }),
    );
    const bindings = [registryBinding("one", one), registryBinding("two", two)];

    const pinned = await resolvePackages(deps(bindings), {
      roots: [skillRef("testing", "^1")],
    });
    expect(pinned.packages[0].version).toBe("1.0.0");

    const latest = await resolvePackages(deps(bindings), {
      roots: [skillRef("testing", "*")],
    });
    expect(latest.packages[0].version).toBe("2.0.0");
  });

  it("resolves transitive pack dependencies and is reproducible", async () => {
    const root = await makeRegistry(async (registry) => {
      await writeSkill(registry, "testing", { metadata: "version: 1.0.0" });
      await writeText(
        registry,
        "packs/core.yaml",
        "version: 1.0.0\nskills:\n  - testing@^1\n",
      );
    });

    const first = await resolvePackages(deps([registryBinding("core", root)]), {
      roots: [{ kind: "pack", name: "core" }],
    });
    expect(codes(first.diagnostics)).toEqual([]);
    expect(first.packages.map((pkg) => `${pkg.kind}:${pkg.name}`).sort()).toEqual([
      "pack:core",
      "skill:testing",
    ]);
    const pack = first.packages.find((pkg) => pkg.kind === "pack");
    expect(pack?.dependencies).toEqual(["skill:testing@1.0.0"]);

    const secondCache = path.join(workDir, "cache-2");
    const second = await resolvePackages(
      deps([registryBinding("core", root)], secondCache),
      { roots: [{ kind: "pack", name: "core" }] },
    );
    expect(JSON.stringify(second.lockfile)).toBe(JSON.stringify(first.lockfile));
  });
});

describe("resolvePackages — failure modes", () => {
  it("reports conflicting transitive constraints", async () => {
    const root = await makeRegistry(async (registry) => {
      await writeSkill(registry, "a", { metadata: "version: 1.0.0\ndependencies:\n  b: ^1" });
      await writeSkill(registry, "b", { metadata: "version: 1.0.0" });
    });
    const two = await makeRegistry((registry) =>
      writeSkill(registry, "b", { metadata: "version: 2.0.0" }),
    );

    const result = await resolvePackages(
      deps([registryBinding("one", root), registryBinding("two", two)]),
      { roots: [skillRef("a"), skillRef("b", "^2")] },
    );

    expect(codes(result.diagnostics)).toContain(CODES.dependencyConflict);
  });

  it("reports dependency cycles", async () => {
    const root = await makeRegistry(async (registry) => {
      await writeSkill(registry, "a", { metadata: "version: 1.0.0\ndependencies:\n  b: ^1" });
      await writeSkill(registry, "b", { metadata: "version: 1.0.0\ndependencies:\n  a: ^1" });
    });

    const result = await resolvePackages(deps([registryBinding("r", root)]), {
      roots: [skillRef("a")],
    });

    expect(codes(result.diagnostics)).toContain(CODES.dependencyCycle);
  });

  it("reports missing versions", async () => {
    const root = await makeRegistry((registry) =>
      writeSkill(registry, "testing", { metadata: "version: 1.0.0" }),
    );

    const result = await resolvePackages(deps([registryBinding("r", root)]), {
      roots: [skillRef("ghost")],
    });

    expect(codes(result.diagnostics)).toContain(CODES.missingVersion);
  });

  it("reports unavailable sources", async () => {
    const result = await resolvePackages(deps([gitBinding("/does/not/exist")]), {
      roots: [skillRef("testing")],
    });

    expect(codes(result.diagnostics)).toContain(CODES.sourceUnavailable);
  });
});

describe("resolvePackages — locked and offline modes", () => {
  it("does not silently upgrade in locked mode", async () => {
    const one = await makeRegistry((root) =>
      writeSkill(root, "testing", { metadata: "version: 1.0.0" }),
    );
    const two = await makeRegistry((root) =>
      writeSkill(root, "testing", { metadata: "version: 2.0.0" }),
    );
    const bindings = [registryBinding("one", one), registryBinding("two", two)];

    const fresh = await resolvePackages(deps(bindings), {
      roots: [skillRef("testing", "^1")],
    });
    expect(fresh.packages[0].version).toBe("1.0.0");

    const locked = await resolvePackages(deps(bindings, path.join(workDir, "c2")), {
      roots: [skillRef("testing", "*")],
      mode: "locked",
      lockfile: fresh.lockfile,
    });
    expect(locked.packages[0].version).toBe("1.0.0");
  });

  it("succeeds offline with a complete cache and fails clearly when missing", async () => {
    const root = await makeRegistry((registry) =>
      writeSkill(registry, "testing", { metadata: "version: 1.0.0" }),
    );
    const bindings = [registryBinding("r", root)];
    const fresh = await resolvePackages(deps(bindings), {
      roots: [skillRef("testing")],
    });

    const offline = await resolvePackages(deps(bindings), {
      roots: [skillRef("testing")],
      mode: "offline",
      lockfile: fresh.lockfile,
    });
    expect(codes(offline.diagnostics)).toEqual([]);
    expect(offline.packages[0].integrity).toBe(fresh.packages[0].integrity);

    const missing = await resolvePackages(
      deps(bindings, path.join(workDir, "empty-cache")),
      { roots: [skillRef("testing")], mode: "offline", lockfile: fresh.lockfile },
    );
    expect(codes(missing.diagnostics)).toContain(CODES.cacheMiss);
  });

  it("detects a corrupt cache", async () => {
    const root = await makeRegistry((registry) =>
      writeSkill(registry, "testing", { metadata: "version: 1.0.0" }),
    );
    const bindings = [registryBinding("r", root)];
    const fresh = await resolvePackages(deps(bindings), {
      roots: [skillRef("testing")],
    });
    const cached = path.join(cacheDir, fresh.packages[0].integrity);
    await writeFile(path.join(cached, "SKILL.md"), "tampered");

    const offline = await resolvePackages(deps(bindings), {
      roots: [skillRef("testing")],
      mode: "offline",
      lockfile: fresh.lockfile,
    });

    expect(codes(offline.diagnostics)).toContain(CODES.integrityMismatch);
  });

  it("detects a checksum mismatch when the source changed", async () => {
    const root = await makeRegistry((registry) =>
      writeSkill(registry, "testing", { metadata: "version: 1.0.0" }),
    );
    const bindings = [registryBinding("r", root)];
    const fresh = await resolvePackages(deps(bindings), {
      roots: [skillRef("testing")],
    });

    await writeSkill(root, "testing", {
      metadata: "version: 1.0.0",
      body: "# changed\n",
    });

    const locked = await resolvePackages(
      deps(bindings, path.join(workDir, "c3")),
      { roots: [skillRef("testing")], mode: "locked", lockfile: fresh.lockfile },
    );
    expect(codes(locked.diagnostics)).toContain(CODES.integrityMismatch);
  });
});

describe("resolvePackages — git sources", () => {
  async function initRepo(): Promise<string> {
    const repo = path.join(workDir, `repo-${counter++}`);
    await mkdir(repo, { recursive: true });
    await writeSkill(repo, "testing", { metadata: "version: 1.0.0" });
    await execa("git", ["init", "-q"], { cwd: repo });
    await execa("git", ["add", "-A"], { cwd: repo });
    await execa("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
    return repo;
  }

  it("pins moving tags to an immutable commit", async () => {
    const repo = await initRepo();
    await execa("git", ["tag", "v1"], { cwd: repo });

    const binding = gitBinding(repo, "v1");
    const fresh = await resolvePackages(deps([binding]), {
      roots: [skillRef("testing")],
    });
    expect(fresh.packages[0].commit).toBeDefined();
    const integrity = fresh.packages[0].integrity;

    // Move the tag to a new commit with different content.
    await writeSkill(repo, "testing", { metadata: "version: 1.0.0", body: "# moved\n" });
    await execa("git", ["add", "-A"], { cwd: repo });
    await execa("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "move"], { cwd: repo });
    await execa("git", ["tag", "-f", "v1"], { cwd: repo });

    const locked = await resolvePackages(
      deps([binding], path.join(workDir, "git-cache")),
      { roots: [skillRef("testing")], mode: "locked", lockfile: fresh.lockfile },
    );
    expect(codes(locked.diagnostics)).toEqual([]);
    expect(locked.packages[0].integrity).toBe(integrity);
  });

  it("rejects subpaths that escape the extraction root", async () => {
    const source = new GitSource();
    await expect(
      source.materialize(
        { kind: "git", location: "/tmp", subpath: "../../escape", raw: "git:/tmp" },
        path.join(workDir, "dest"),
      ),
    ).rejects.toThrow(/escapes/);
  });
});

describe("resolvePackages — trust", () => {
  it("fails closed and writes nothing when confirmation is required", async () => {
    const root = await makeRegistry((registry) =>
      writeSkill(registry, "deploy", {
        metadata: "version: 1.0.0",
        files: { "scripts/run.sh": "#!/bin/sh\necho hi\n" },
      }),
    );

    const result = await resolvePackages(deps([registryBinding("r", root)]), {
      roots: [skillRef("deploy")],
    });

    expect(result.rejected).toBe(true);
    expect(result.requiresConfirmation).toHaveLength(1);
    expect(result.lockfile.entries).toEqual([]);
    expect(await filesystem.exists(cacheDir)).toBe(false);
  });

  it("installs with explicit consent", async () => {
    const root = await makeRegistry((registry) =>
      writeSkill(registry, "deploy", {
        metadata: "version: 1.0.0",
        files: { "scripts/run.sh": "#!/bin/sh\necho hi\n" },
      }),
    );

    const result = await resolvePackages(deps([registryBinding("r", root)]), {
      roots: [skillRef("deploy")],
      consent: { allow: true },
    });

    expect(result.rejected).toBe(false);
    expect(result.lockfile.entries).toHaveLength(1);
  });

  it("denies packages when the policy denies scripts", async () => {
    const root = await makeRegistry((registry) =>
      writeSkill(registry, "deploy", {
        metadata: "version: 1.0.0",
        files: { "scripts/run.sh": "#!/bin/sh\necho hi\n" },
      }),
    );

    const result = await resolvePackages(deps([registryBinding("r", root)]), {
      roots: [skillRef("deploy")],
      trust: { ...DEFAULT_TRUST_POLICY, scripts: "deny" },
      consent: { allow: true },
    });

    expect(result.rejected).toBe(true);
    expect(result.lockfile.entries).toEqual([]);
  });

  it("never executes bundled scripts", async () => {
    const marker = path.join(workDir, "executed.marker");
    const root = await makeRegistry((registry) =>
      writeSkill(registry, "deploy", {
        metadata: "version: 1.0.0",
        files: {
          "scripts/run.sh": `#!/bin/sh\nnode -e "require('fs').writeFileSync('${marker}','x')"\n`,
        },
      }),
    );

    await resolvePackages(deps([registryBinding("r", root)]), {
      roots: [skillRef("deploy")],
      consent: { allow: true },
    });

    expect(await filesystem.exists(marker)).toBe(false);
  });
});
