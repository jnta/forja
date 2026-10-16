import { hasErrors, makeDiagnostic, type Diagnostic } from "@/domain/diagnostics";
import type { ContentCachePort } from "@/domain/cache";
import type { FilesystemPort } from "@/domain/filesystem";
import { LOCKFILE_VERSION, type LockEntry, type Lockfile } from "@/domain/lockfile";
import type { ComponentKind } from "@/domain/references";
import type {
  YamlDocumentPort,
  YamlParserPort,
  YamlSerializerPort,
} from "@/domain/serialization";
import { DEFAULT_TRUST_POLICY, type TrustConsent } from "@/domain/trust";

import { GLOBAL_CONFIG_FILE, PROJECT_CONFIG_FILE } from "../library/paths";
import { parseLockfile, serializeLockfile } from "../resolve/lockfile";
import { resolvePackages, type ResolvedPackage, type SourceBinding } from "../resolve/resolver";
import { configSchema } from "../schemas";
import { toNameList } from "../schemas/common";
import type { Scope } from "../scope";
import { formatRef, installPackage, KIND_CONFIG_KEY, parseAddRef } from "./ref";

export interface PackageDeps {
  readonly filesystem: FilesystemPort;
  readonly yaml: YamlParserPort & YamlSerializerPort & YamlDocumentPort;
  readonly cache: ContentCachePort;
  readonly createSources: (sources: readonly string[]) => readonly SourceBinding[];
  readonly stagingRoot: string;
}

export interface PackagePaths {
  readonly scope: Scope;
  readonly projectDir: string;
  readonly globalDir: string;
  readonly homeDir: string;
}

export interface PackageLocation {
  readonly configFile: string;
  readonly libraryRoot: string;
  readonly lockFile: string;
}

export function locatePackages(
  filesystem: FilesystemPort,
  paths: PackagePaths,
): PackageLocation {
  if (paths.scope === "global") {
    return {
      configFile: filesystem.resolve(paths.globalDir, GLOBAL_CONFIG_FILE),
      libraryRoot: paths.globalDir,
      lockFile: filesystem.resolve(paths.globalDir, "forja.lock"),
    };
  }
  return {
    configFile: filesystem.resolve(paths.projectDir, PROJECT_CONFIG_FILE),
    libraryRoot: filesystem.resolve(paths.projectDir, ".forja"),
    lockFile: filesystem.resolve(paths.projectDir, "forja.lock"),
  };
}

export async function readConfig(
  deps: PackageDeps,
  file: string,
  diagnostics: Diagnostic[],
): Promise<{ source: string; data: Record<string, unknown> } | null> {
  const source = (await deps.filesystem.exists(file))
    ? await deps.filesystem.readFile(file)
    : "";
  let raw: unknown = {};
  try {
    raw = source.length > 0 ? deps.yaml.parse(source) : {};
  } catch (error) {
    diagnostics.push(
      makeDiagnostic({
        code: "FORJA-CFG-001",
        message: `cannot parse ${file}: ${(error as Error).message}`,
        file,
      }),
    );
    return null;
  }
  const parsed = configSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    diagnostics.push(
      makeDiagnostic({
        code: "FORJA-CFG-002",
        message: `invalid configuration: ${parsed.error.issues[0]?.message ?? "invalid"}`,
        file,
      }),
    );
    return null;
  }
  return { source, data: parsed.data as Record<string, unknown> };
}

export async function readLock(deps: PackageDeps, file: string): Promise<Lockfile> {
  if (!(await deps.filesystem.exists(file))) {
    return { lockfileVersion: LOCKFILE_VERSION, entries: [] };
  }
  try {
    const raw = deps.yaml.parse(await deps.filesystem.readFile(file));
    const diagnostics: Diagnostic[] = [];
    return (
      parseLockfile(raw, file, diagnostics) ?? {
        lockfileVersion: LOCKFILE_VERSION,
        entries: [],
      }
    );
  } catch {
    return { lockfileVersion: LOCKFILE_VERSION, entries: [] };
  }
}

export function refList(data: Record<string, unknown>, kind: ComponentKind): string[] {
  const value = data[KIND_CONFIG_KEY[kind]];
  if (value === undefined) return [];
  return toNameList(value as string[] | Record<string, string>);
}

export function upsertRef(list: string[], name: string, range?: string): string[] {
  const next = list.filter((entry) => entry.split("@")[0] !== name);
  next.push(formatRef(name, range));
  return next.sort();
}

export function mergeLock(
  existing: Lockfile,
  added: readonly ResolvedPackage[],
): Lockfile {
  const map = new Map<string, LockEntry>();
  for (const entry of existing.entries) map.set(`${entry.kind}:${entry.name}`, entry);
  for (const pkg of added) {
    map.set(`${pkg.kind}:${pkg.name}`, {
      kind: pkg.kind,
      name: pkg.name,
      version: pkg.version,
      source: pkg.source,
      integrity: pkg.integrity,
      commit: pkg.commit,
      dependencies: pkg.dependencies,
    });
  }
  const entries = [...map.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );
  return { lockfileVersion: LOCKFILE_VERSION, entries };
}

export function emptyLockfile(): Lockfile {
  return { lockfileVersion: LOCKFILE_VERSION, entries: [] };
}

export interface AddOptions extends PackagePaths {
  readonly input: string;
  readonly kind?: ComponentKind;
  readonly consent?: TrustConsent;
}

export interface AddResult {
  readonly kind: ComponentKind;
  readonly name: string;
  readonly packages: readonly ResolvedPackage[];
  readonly installed: readonly string[];
  readonly lockfile: Lockfile;
  readonly diagnostics: readonly Diagnostic[];
  readonly aborted: boolean;
  readonly requiresConfirmation: boolean;
}

/** Transactionally add a package: resolve and install before writing config/lock. */
export async function addPackage(
  deps: PackageDeps,
  options: AddOptions,
): Promise<AddResult> {
  const diagnostics: Diagnostic[] = [];
  const parsed = parseAddRef(options.input, options.kind ?? "skill");
  if (!parsed.ok) {
    diagnostics.push(
      makeDiagnostic({ code: "FORJA-PKG-002", message: parsed.message }),
    );
    return emptyResult("skill", "", diagnostics, true, false);
  }
  const { kind, name, range, source } = parsed.value;
  const location = locatePackages(deps.filesystem, options);

  const config = await readConfig(deps, location.configFile, diagnostics);
  if (!config) return emptyResult(kind, name, diagnostics, true, false);

  const refs = upsertRef(refList(config.data, kind), name, range);
  const sources = new Set(
    Array.isArray(config.data.sources) ? (config.data.sources as string[]) : [],
  );
  if (source) sources.add(source);

  const bindings = deps.createSources([...sources]);
  const resolved = await resolvePackages(
    {
      filesystem: deps.filesystem,
      yaml: deps.yaml,
      sources: bindings,
      cache: deps.cache,
      stagingRoot: deps.stagingRoot,
    },
    {
      roots: [{ kind, name, range }],
      mode: "install",
      trust: DEFAULT_TRUST_POLICY,
      consent: options.consent,
    },
  );
  diagnostics.push(...resolved.diagnostics);

  if (resolved.rejected || hasErrors(diagnostics)) {
    return emptyResult(
      kind,
      name,
      diagnostics,
      true,
      resolved.requiresConfirmation.length > 0,
    );
  }

  const installed: string[] = [];
  for (const pkg of resolved.packages) {
    installed.push(await installPackage(deps.filesystem, location.libraryRoot, pkg));
  }

  let updatedSource = deps.yaml.setConfigValue(config.source, KIND_CONFIG_KEY[kind], refs);
  if (source) {
    updatedSource = deps.yaml.setConfigValue(updatedSource, "sources", [...sources].sort());
  }
  await deps.filesystem.writeFile(location.configFile, updatedSource);

  const merged = mergeLock(await readLock(deps, location.lockFile), resolved.packages);
  await deps.filesystem.writeFile(
    location.lockFile,
    deps.yaml.stringify(serializeLockfile(merged)),
  );

  return {
    kind,
    name,
    packages: resolved.packages,
    installed,
    lockfile: merged,
    diagnostics,
    aborted: false,
    requiresConfirmation: false,
  };
}

function emptyResult(
  kind: ComponentKind,
  name: string,
  diagnostics: readonly Diagnostic[],
  aborted: boolean,
  requiresConfirmation: boolean,
): AddResult {
  return {
    kind,
    name,
    packages: [],
    installed: [],
    lockfile: emptyLockfile(),
    diagnostics,
    aborted,
    requiresConfirmation,
  };
}
