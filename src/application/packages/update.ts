import semver from "semver";

import { hasErrors, makeDiagnostic, type Diagnostic } from "@/domain/diagnostics";
import type { ComponentKind } from "@/domain/references";
import { DEFAULT_TRUST_POLICY, type TrustConsent } from "@/domain/trust";

import { serializeLockfile } from "../resolve/lockfile";
import { resolvePackages } from "../resolve/resolver";
import { packageKey } from "../resolve/enumerate";
import { collectAvailable } from "./available";
import {
  locatePackages,
  mergeLock,
  readConfig,
  readLock,
  refList,
  type PackageDeps,
  type PackagePaths,
} from "./add";
import { installPackage } from "./ref";

const KINDS: readonly ComponentKind[] = ["skill", "agent", "workflow", "policy", "pack"];

export interface UpdateOptions extends PackagePaths {
  readonly target?: string;
  readonly kind?: ComponentKind;
  readonly dryRun?: boolean;
  readonly consent?: TrustConsent;
}

export interface UpdateChange {
  readonly kind: ComponentKind;
  readonly name: string;
  readonly from?: string;
  readonly to: string;
}

export interface SkippedMajor {
  readonly kind: ComponentKind;
  readonly name: string;
  readonly current?: string;
  readonly wanted: string;
  readonly latest: string;
}

export interface UpdateResult {
  readonly changes: readonly UpdateChange[];
  readonly skippedMajor: readonly SkippedMajor[];
  readonly pinned: readonly string[];
  readonly applied: boolean;
  readonly aborted: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Update installed packages to the highest version allowed by their range
 * (PRD 25). Exact version pins are never upgraded; major updates beyond the
 * range are reported but skipped.
 */
export async function updatePackages(
  deps: PackageDeps,
  options: UpdateOptions,
): Promise<UpdateResult> {
  const diagnostics: Diagnostic[] = [];
  const location = locatePackages(deps.filesystem, options);
  const config = await readConfig(deps, location.configFile, diagnostics);
  if (!config) {
    return { changes: [], skippedMajor: [], pinned: [], applied: false, aborted: true, diagnostics };
  }

  const lock = await readLock(deps, location.lockFile);
  const lockByKey = new Map(
    lock.entries.map((entry) => [`${entry.kind}:${entry.name}`, entry]),
  );

  const sources = Array.isArray(config.data.sources)
    ? (config.data.sources as string[])
    : [];
  const { packages } = await collectAvailable(
    { filesystem: deps.filesystem, yaml: deps.yaml, stagingRoot: deps.stagingRoot },
    deps.createSources(sources),
  );

  const changes: UpdateChange[] = [];
  const skippedMajor: SkippedMajor[] = [];
  const pinned: string[] = [];
  const roots: { kind: ComponentKind; name: string; range?: string }[] = [];

  for (const kind of KINDS) {
    if (options.kind && options.kind !== kind) continue;
    for (const entry of refList(config.data, kind)) {
      const at = entry.indexOf("@");
      const name = at === -1 ? entry : entry.slice(0, at);
      const range = at === -1 ? undefined : entry.slice(at + 1);
      if (options.target && options.target !== name) continue;

      const key = packageKey(kind, name);
      const installed = lockByKey.get(key);
      if (!installed) continue;

      if (range !== undefined && semver.valid(range) !== null) {
        pinned.push(key);
        continue;
      }

      const available = packages.get(key);
      if (!available || available.length === 0) {
        diagnostics.push(
          makeDiagnostic({
            code: "FORJA-PKG-009",
            severity: "warning",
            message: `cannot check ${key}: no source metadata available`,
          }),
        );
        continue;
      }

      const versions = available
        .map((pkg) => pkg.version)
        .filter((version) => semver.valid(version) !== null)
        .sort((a, b) => semver.rcompare(a, b));
      const wanted = range
        ? versions.find((version) => semver.satisfies(version, range))
        : versions[0];
      const latest = versions[0];
      if (!wanted) continue;

      if (latest && semver.major(latest) > semver.major(wanted)) {
        skippedMajor.push({ kind, name, current: installed.version, wanted, latest });
      }
      if (wanted === installed.version) continue;

      changes.push({ kind, name, from: installed.version, to: wanted });
      roots.push({ kind, name, range });
    }
  }

  if (options.dryRun || changes.length === 0) {
    return {
      changes,
      skippedMajor,
      pinned,
      applied: false,
      aborted: false,
      diagnostics,
    };
  }

  const resolved = await resolvePackages(
    {
      filesystem: deps.filesystem,
      yaml: deps.yaml,
      sources: deps.createSources(sources),
      cache: deps.cache,
      stagingRoot: deps.stagingRoot,
    },
    {
      roots,
      mode: "install",
      trust: DEFAULT_TRUST_POLICY,
      consent: options.consent,
    },
  );
  diagnostics.push(...resolved.diagnostics);
  if (resolved.rejected || hasErrors(diagnostics)) {
    return { changes, skippedMajor, pinned, applied: false, aborted: true, diagnostics };
  }

  for (const pkg of resolved.packages) {
    await installPackage(deps.filesystem, location.libraryRoot, pkg);
  }
  const merged = mergeLock(lock, resolved.packages);
  await deps.filesystem.writeFile(
    location.lockFile,
    deps.yaml.stringify(serializeLockfile(merged)),
  );

  return { changes, skippedMajor, pinned, applied: true, aborted: false, diagnostics };
}
