import semver from "semver";

import type { ContentCachePort } from "@/domain/cache";
import type { Diagnostic } from "@/domain/diagnostics";
import type { FilesystemPort } from "@/domain/filesystem";
import {
  LOCKFILE_VERSION,
  type LockEntry,
  type Lockfile,
} from "@/domain/lockfile";
import type {
  MaterializedSource,
  PackageSourcePort,
  SourcePackage,
  SourceSpec,
} from "@/domain/package-source";
import type { ComponentKind, ComponentRef } from "@/domain/references";
import type { YamlParserPort } from "@/domain/serialization";
import {
  DEFAULT_TRUST_POLICY,
  type RiskSummary,
  type TrustConsent,
  type TrustPolicy,
} from "@/domain/trust";

import { CODES, makeDiagnostic } from "../library/diagnostics";
import { enumeratePackages, packageKey, type EnumeratedSource } from "./enumerate";
import { hashPath } from "./integrity";
import { formatSource, parseSourceSpec } from "./source-spec";
import { assessRisk, evaluateTrust } from "./trust";

export interface SourceBinding {
  readonly spec: SourceSpec;
  readonly port: PackageSourcePort;
}

export interface ResolveDeps {
  readonly filesystem: FilesystemPort;
  readonly yaml: YamlParserPort;
  readonly sources: readonly SourceBinding[];
  readonly cache: ContentCachePort;
  /** Temporary directory for materializing sources. */
  readonly stagingRoot: string;
}

export type ResolveMode = "install" | "locked" | "offline";

export interface ResolveInput {
  readonly roots: readonly ComponentRef[];
  readonly mode?: ResolveMode;
  readonly lockfile?: Lockfile;
  readonly trust?: TrustPolicy;
  readonly consent?: TrustConsent;
}

export interface ResolvedPackage {
  readonly kind: ComponentKind;
  readonly name: string;
  readonly version: string;
  readonly source: string;
  readonly integrity: string;
  readonly commit?: string;
  readonly directory: string;
  readonly dependencies: readonly string[];
}

export interface ResolveResult {
  readonly packages: readonly ResolvedPackage[];
  readonly lockfile: Lockfile;
  readonly diagnostics: readonly Diagnostic[];
  readonly risk: readonly RiskSummary[];
  readonly requiresConfirmation: readonly RiskSummary[];
  readonly rejected: boolean;
}

interface SourceState extends EnumeratedSource {
  readonly spec: SourceSpec;
  readonly root: string;
  readonly commit?: string;
  readonly source: string;
}

interface FoundPackage {
  readonly component: {
    readonly kind: ComponentKind;
    readonly name: string;
    readonly version: string;
    readonly source: string;
    readonly integrity: string;
    readonly commit?: string;
    readonly directory: string;
  };
  readonly dependencies: readonly ComponentRef[];
}

function emptyLockfile(): Lockfile {
  return { lockfileVersion: LOCKFILE_VERSION, entries: [] };
}

function matchesVersion(version: string, range?: string): boolean {
  if (range === undefined || range === "*" || range.length === 0) return true;
  if (version === "0.0.0") return true; // unversioned kinds ignore ranges
  const valid = semver.valid(version);
  if (valid === null) return true;
  const validRange = semver.validRange(range);
  if (validRange === null) return true;
  return semver.satisfies(valid, validRange);
}

function higherVersion(a: string, b: string): number {
  const left = semver.valid(a) ?? "0.0.0";
  const right = semver.valid(b) ?? "0.0.0";
  return semver.rcompare(left, right);
}

function findCycle(
  nodes: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const present = new Set(nodes);
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  let cycle: string[] | null = null;

  const visit = (node: string): boolean => {
    state.set(node, 1);
    stack.push(node);
    for (const next of [...(edges.get(node) ?? [])].sort()) {
      if (!present.has(next)) continue;
      const nextState = state.get(next) ?? 0;
      if (nextState === 1) {
        cycle = [...stack.slice(stack.indexOf(next)), next];
        return true;
      }
      if (nextState === 0 && visit(next)) return true;
    }
    stack.pop();
    state.set(node, 2);
    return false;
  };

  for (const node of [...nodes].sort()) {
    if ((state.get(node) ?? 0) === 0 && visit(node)) return cycle;
  }
  return null;
}

async function loadSource(
  deps: ResolveDeps,
  spec: SourceSpec,
  port: PackageSourcePort,
  index: number,
  diagnostics: Diagnostic[],
): Promise<SourceState> {
  const destination = deps.filesystem.resolve(deps.stagingRoot, `source-${index}`);
  await deps.filesystem.remove(destination, { recursive: true, force: true });
  await deps.filesystem.mkdir(destination, { recursive: true });

  let materialized: MaterializedSource;
  try {
    materialized = await port.materialize(spec, destination);
  } catch (error) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.sourceUnavailable,
        message: `cannot access source "${spec.raw}": ${(error as Error).message}`,
        resolution: "Check the source reference and your network connection.",
      }),
    );
    return {
      packages: [],
      dependencies: new Map(),
      diagnostics: [],
      spec,
      root: destination,
      source: spec.raw,
    };
  }

  const enumerated = await enumeratePackages(deps, materialized.directory);
  diagnostics.push(...enumerated.diagnostics);
  return {
    ...enumerated,
    spec,
    root: materialized.directory,
    commit: materialized.commit,
    source: materialized.source,
  };
}

async function resolveFresh(
  deps: ResolveDeps,
  input: ResolveInput,
  diagnostics: Diagnostic[],
): Promise<ResolveResult> {
  const sourceCache = new Map<number, Promise<SourceState>>();
  const sourceState = (index: number): Promise<SourceState> => {
    const cached = sourceCache.get(index);
    if (cached) return cached;
    const promise = loadSource(
      deps,
      deps.sources[index].spec,
      deps.sources[index].port,
      index,
      diagnostics,
    );
    sourceCache.set(index, promise);
    return promise;
  };

  const resolved = new Map<string, ResolvedPackage>();
  const dependencies = new Map<string, readonly ComponentRef[]>();

  const findPackage = async (ref: ComponentRef): Promise<FoundPackage | null> => {
    const candidates: Array<{ state: SourceState; pkg: SourcePackage; index: number }> = [];
    for (let index = 0; index < deps.sources.length; index += 1) {
      const state = await sourceState(index);
      for (const pkg of state.packages) {
        if (pkg.kind !== ref.kind || pkg.name !== ref.name) continue;
        if (!matchesVersion(pkg.version, ref.range)) continue;
        candidates.push({ state, pkg, index });
      }
    }
    if (candidates.length === 0) return null;

    candidates.sort(
      (a, b) =>
        higherVersion(a.pkg.version, b.pkg.version) || a.index - b.index,
    );
    const chosen = candidates[0];

    return {
      component: {
        kind: chosen.pkg.kind,
        name: chosen.pkg.name,
        version: chosen.pkg.version,
        source: formatSource(chosen.state.spec, chosen.state.commit),
        integrity: await hashPath(deps.filesystem, chosen.pkg.directory),
        commit: chosen.state.commit,
        directory: chosen.pkg.directory,
      },
      dependencies:
        chosen.state.dependencies.get(packageKey(ref.kind, ref.name)) ?? [],
    };
  };

  const queue: ComponentRef[] = [...input.roots];
  while (queue.length > 0) {
    const ref = queue.shift();
    if (!ref) break;
    const key = packageKey(ref.kind, ref.name);
    const existing = resolved.get(key);
    if (existing) {
      if (!matchesVersion(existing.version, ref.range)) {
        diagnostics.push(
          makeDiagnostic({
            code: CODES.dependencyConflict,
            message: `${ref.kind} "${ref.name}" is locked at ${existing.version}, which does not satisfy "${ref.range}"`,
            resolution: "Run `forja update` or loosen the conflicting constraint.",
          }),
        );
      }
      continue;
    }

    const found = await findPackage(ref);
    if (found === null) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.missingVersion,
          message: `no source provides ${ref.kind} "${ref.name}"${ref.range ? `@${ref.range}` : ""}`,
        }),
      );
      continue;
    }

    resolved.set(key, {
      ...found.component,
      dependencies: found.dependencies.map((dependency) => packageKey(dependency.kind, dependency.name)),
    });
    dependencies.set(key, found.dependencies);
    queue.push(...found.dependencies);
  }

  const edges = new Map<string, readonly string[]>();
  for (const [key, refs] of dependencies) {
    edges.set(key, refs.map((ref) => packageKey(ref.kind, ref.name)));
  }
  const cycle = findCycle([...resolved.keys()], edges);
  if (cycle) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.dependencyCycle,
        message: `dependency cycle: ${cycle.join(" → ")}`,
      }),
    );
  }

  const ordered = [...resolved.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );

  const policy = input.trust ?? DEFAULT_TRUST_POLICY;
  const risk: RiskSummary[] = [];
  for (const pkg of ordered) {
    risk.push(
      await assessRisk(deps.filesystem, {
        kind: pkg.kind,
        name: pkg.name,
        version: pkg.version,
        directory: pkg.directory,
        source: pkg.source,
      }),
    );
  }
  const evaluation = evaluateTrust(policy, risk, input.consent);

  if (!evaluation.allowed) {
    return {
      packages: ordered,
      lockfile: emptyLockfile(),
      diagnostics,
      risk,
      requiresConfirmation: evaluation.requiresConfirmation,
      rejected: true,
    };
  }

  const packages: ResolvedPackage[] = [];
  for (const pkg of ordered) {
    await deps.cache.store(pkg.integrity, pkg.directory);
    packages.push({
      ...pkg,
      dependencies: (dependencies.get(packageKey(pkg.kind, pkg.name)) ?? []).map((ref) => {
        const dep = resolved.get(packageKey(ref.kind, ref.name));
        return dep
          ? `${dep.kind}:${dep.name}@${dep.version}`
          : packageKey(ref.kind, ref.name);
      }),
    });
  }

  const entries: LockEntry[] = packages.map((pkg) => ({
    kind: pkg.kind,
    name: pkg.name,
    version: pkg.version,
    source: pkg.source,
    integrity: pkg.integrity,
    commit: pkg.commit,
    dependencies: pkg.dependencies,
  }));

  return {
    packages,
    lockfile: { lockfileVersion: LOCKFILE_VERSION, entries },
    diagnostics,
    risk,
    requiresConfirmation: [],
    rejected: false,
  };
}

async function materializeForLock(
  deps: ResolveDeps,
  entry: LockEntry,
  index: number,
  diagnostics: Diagnostic[],
): Promise<SourceState | null> {
  const parsed = parseSourceSpec(entry.source);
  if (!parsed.ok) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.invalidSchema,
        message: `cannot resolve locked source "${entry.source}": ${parsed.message}`,
      }),
    );
    return null;
  }
  const binding =
    deps.sources.find(
      (candidate) =>
        candidate.spec.kind === parsed.spec.kind &&
        candidate.spec.location === parsed.spec.location,
    ) ?? deps.sources.find((candidate) => candidate.port.canResolve(parsed.spec));
  if (!binding) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.missingSource,
        message: `no configured source can provide "${entry.source}"`,
      }),
    );
    return null;
  }
  return loadSource(deps, parsed.spec, binding.port, index, diagnostics);
}

async function resolveLocked(
  deps: ResolveDeps,
  input: ResolveInput,
  diagnostics: Diagnostic[],
): Promise<ResolveResult> {
  const lock = input.lockfile;
  if (!lock) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.missingLockfile,
        message: `${input.mode ?? "locked"} mode requires forja.lock`,
        resolution: "Run `forja sync` without --offline to create it.",
      }),
    );
    return {
      packages: [],
      lockfile: emptyLockfile(),
      diagnostics,
      risk: [],
      requiresConfirmation: [],
      rejected: false,
    };
  }

  const lockedKeys = new Set(lock.entries.map((entry) => packageKey(entry.kind, entry.name)));
  for (const root of input.roots) {
    if (!lockedKeys.has(packageKey(root.kind, root.name))) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.missingVersion,
          message: `forja.lock has no entry for ${root.kind} "${root.name}"`,
        }),
      );
    }
  }

  const packages: ResolvedPackage[] = [];
  for (const entry of lock.entries) {
    let directory: string | null = null;

    if (await deps.cache.has(entry.integrity)) {
      const cached = await deps.cache.directoryFor(entry.integrity);
      const actual = await hashPath(deps.filesystem, cached);
      if (actual !== entry.integrity) {
        diagnostics.push(
          makeDiagnostic({
            code: CODES.integrityMismatch,
            message: `cached content for ${entry.kind} "${entry.name}" is corrupt: expected ${entry.integrity}, got ${actual}`,
            resolution: "Remove the cache entry and resolve again online.",
          }),
        );
        continue;
      }
      directory = cached;
    } else if (input.mode === "offline") {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.cacheMiss,
          message: `offline mode: ${entry.kind} "${entry.name}" is not in the cache`,
          resolution: "Run once online, or remove --offline.",
        }),
      );
      continue;
    } else {
      const state = await materializeForLock(deps, entry, packages.length, diagnostics);
      if (!state) continue;
      const pkg = state.packages.find(
        (candidate) => candidate.kind === entry.kind && candidate.name === entry.name,
      );
      if (!pkg) {
        diagnostics.push(
          makeDiagnostic({
            code: CODES.missingVersion,
            message: `locked ${entry.kind} "${entry.name}" is no longer present at ${entry.source}`,
          }),
        );
        continue;
      }
      const actual = await hashPath(deps.filesystem, pkg.directory);
      if (actual !== entry.integrity) {
        diagnostics.push(
          makeDiagnostic({
            code: CODES.integrityMismatch,
            message: `integrity mismatch for ${entry.kind} "${entry.name}": expected ${entry.integrity}, got ${actual}`,
            resolution: "Review the source, then run `forja update` to relock.",
          }),
        );
        continue;
      }
      directory = await deps.cache.store(entry.integrity, pkg.directory);
    }

    packages.push({
      kind: entry.kind,
      name: entry.name,
      version: entry.version,
      source: entry.source,
      integrity: entry.integrity,
      commit: entry.commit,
      directory,
      dependencies: entry.dependencies,
    });
  }

  return {
    packages,
    lockfile: lock,
    diagnostics,
    risk: [],
    requiresConfirmation: [],
    rejected: false,
  };
}

/** Resolve configured roots to reproducible packages. */
export async function resolvePackages(
  deps: ResolveDeps,
  input: ResolveInput,
): Promise<ResolveResult> {
  const diagnostics: Diagnostic[] = [];
  const mode = input.mode ?? "install";
  if (mode === "install") return resolveFresh(deps, input, diagnostics);
  return resolveLocked(deps, { ...input, mode }, diagnostics);
}
