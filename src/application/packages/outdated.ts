import semver from "semver";

import type { Diagnostic } from "@/domain/diagnostics";
import type { SourcePackage } from "@/domain/package-source";
import type { ComponentKind } from "@/domain/references";

import { packageKey } from "../resolve/enumerate";
import { collectAvailable } from "./available";
import {
  locatePackages,
  readConfig,
  readLock,
  refList,
  type PackageDeps,
  type PackagePaths,
} from "./add";

const KINDS: readonly ComponentKind[] = ["skill", "agent", "workflow", "policy", "pack"];

export type OutdatedStatus =
  | "up-to-date"
  | "outdated"
  | "unavailable"
  | "not-installed";

export interface OutdatedRow {
  readonly kind: ComponentKind;
  readonly name: string;
  readonly current?: string;
  readonly wanted?: string;
  readonly latest?: string;
  readonly status: OutdatedStatus;
}

export interface OutdatedResult {
  readonly rows: readonly OutdatedRow[];
  readonly unavailableSources: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

function pick(packages: readonly SourcePackage[], range?: string): string | undefined {
  const versions = packages
    .map((pkg) => pkg.version)
    .filter((version) => semver.valid(version) !== null)
    .sort((a, b) => semver.rcompare(a, b));
  if (versions.length === 0) return undefined;
  if (!range || range === "*") return versions[0];
  return versions.find((version) => semver.satisfies(version, range));
}

/** Report current / wanted / latest versions (PRD 26). */
export async function outdatedPackages(
  deps: PackageDeps,
  paths: PackagePaths,
): Promise<OutdatedResult> {
  const diagnostics: Diagnostic[] = [];
  const location = locatePackages(deps.filesystem, paths);
  const config = await readConfig(deps, location.configFile, diagnostics);
  if (!config) return { rows: [], unavailableSources: [], diagnostics };

  const lock = await readLock(deps, location.lockFile);
  const lockByKey = new Map(
    lock.entries.map((entry) => [`${entry.kind}:${entry.name}`, entry]),
  );

  const sources = Array.isArray(config.data.sources)
    ? (config.data.sources as string[])
    : [];
  const { packages, unavailable } = await collectAvailable(
    { filesystem: deps.filesystem, yaml: deps.yaml, stagingRoot: deps.stagingRoot },
    deps.createSources(sources),
  );

  const rows: OutdatedRow[] = [];
  for (const kind of KINDS) {
    for (const entry of refList(config.data, kind)) {
      const at = entry.indexOf("@");
      const name = at === -1 ? entry : entry.slice(0, at);
      const range = at === -1 ? undefined : entry.slice(at + 1);
      const key = packageKey(kind, name);
      const current = lockByKey.get(key)?.version;
      const available = packages.get(key);

      if (!available || available.length === 0) {
        rows.push({ kind, name, current, status: "unavailable" });
        continue;
      }

      const wanted = pick(available, range);
      const latest = pick(available);
      const status: OutdatedStatus =
        current === undefined
          ? "not-installed"
          : current === latest
            ? "up-to-date"
            : "outdated";
      rows.push({ kind, name, current, wanted, latest, status });
    }
  }

  rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  return { rows, unavailableSources: unavailable, diagnostics };
}
