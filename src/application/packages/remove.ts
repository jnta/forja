import { makeDiagnostic, type Diagnostic } from "@/domain/diagnostics";
import type { ComponentKind } from "@/domain/references";

import { serializeLockfile } from "../resolve/lockfile";
import { KIND_CONFIG_KEY, uninstallPackage } from "./ref";
import {
  emptyLockfile,
  locatePackages,
  readConfig,
  readLock,
  refList,
  type PackageDeps,
  type PackagePaths,
} from "./add";

const KINDS: readonly ComponentKind[] = ["skill", "agent", "workflow", "policy", "pack"];

function configKeys(data: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const kind of KINDS) {
    for (const entry of refList(data, kind)) {
      keys.push(`${kind}:${entry.split("@")[0]}`);
    }
  }
  return keys;
}

export interface RemoveOptions extends PackagePaths {
  readonly name: string;
  readonly kind?: ComponentKind;
}

export interface RemoveResult {
  readonly kind: ComponentKind;
  readonly name: string;
  readonly removed: readonly string[];
  readonly retained: readonly string[];
  readonly lockfile: ReturnType<typeof emptyLockfile>;
  readonly diagnostics: readonly Diagnostic[];
  readonly notFound: boolean;
}

/**
 * Remove a package reference and prune only the installed content that is no
 * longer reachable from the remaining configuration (PRD 24).
 */
export async function removePackage(
  deps: PackageDeps,
  options: RemoveOptions,
): Promise<RemoveResult> {
  const diagnostics: Diagnostic[] = [];
  const kind = options.kind ?? "skill";
  const location = locatePackages(deps.filesystem, options);

  const config = await readConfig(deps, location.configFile, diagnostics);
  if (!config) {
    return {
      kind,
      name: options.name,
      removed: [],
      retained: [],
      lockfile: emptyLockfile(),
      diagnostics,
      notFound: false,
    };
  }

  const refs = refList(config.data, kind);
  if (!refs.some((entry) => entry.split("@")[0] === options.name)) {
    diagnostics.push(
      makeDiagnostic({
        code: "FORJA-PKG-002",
        severity: "warning",
        message: `${kind} "${options.name}" is not configured`,
      }),
    );
    return {
      kind,
      name: options.name,
      removed: [],
      retained: [],
      lockfile: emptyLockfile(),
      diagnostics,
      notFound: true,
    };
  }

  const remaining = refs.filter((entry) => entry.split("@")[0] !== options.name);
  const updatedData = { ...config.data, [KIND_CONFIG_KEY[kind]]: remaining };

  const lock = await readLock(deps, location.lockFile);
  const needed = new Set(configKeys(updatedData));
  const lockByKey = new Map(lock.entries.map((entry) => [`${entry.kind}:${entry.name}`, entry]));
  const queue = [...needed];
  while (queue.length > 0) {
    const key = queue.pop();
    if (!key) continue;
    const entry = lockByKey.get(key);
    if (!entry) continue;
    for (const dependency of entry.dependencies) {
      const depKey = dependency.split("@")[0];
      if (!needed.has(depKey)) {
        needed.add(depKey);
        queue.push(depKey);
      }
    }
  }

  const removed: string[] = [];
  const retained: string[] = [];
  for (const entry of lock.entries) {
    const key = `${entry.kind}:${entry.name}`;
    if (needed.has(key)) {
      retained.push(key);
      continue;
    }
    await uninstallPackage(deps.filesystem, location.libraryRoot, entry.kind, entry.name);
    removed.push(key);
  }

  const updatedSource = deps.yaml.setConfigValue(
    config.source,
    KIND_CONFIG_KEY[kind],
    remaining,
  );
  await deps.filesystem.writeFile(location.configFile, updatedSource);

  const keptEntries = lock.entries.filter((entry) =>
    needed.has(`${entry.kind}:${entry.name}`),
  );
  const nextLock = { lockfileVersion: lock.lockfileVersion, entries: keptEntries };
  await deps.filesystem.writeFile(
    location.lockFile,
    deps.yaml.stringify(serializeLockfile(nextLock)),
  );

  return {
    kind,
    name: options.name,
    removed,
    retained,
    lockfile: nextLock,
    diagnostics,
    notFound: false,
  };
}
