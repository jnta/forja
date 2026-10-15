import type { FilesystemPort } from "@/domain/filesystem";
import type {
  HarnessAdapterPort,
  HarnessState,
  ProjectContext,
} from "@/domain/harness-adapter";
import type { YamlDocumentPort, YamlParserPort } from "@/domain/serialization";

import { PROJECT_CONFIG_FILE } from "../library/paths";
import { configSchema } from "../schemas";
import { toHarnessEntries } from "../schemas/common";

export interface HarnessDeps {
  readonly filesystem: FilesystemPort;
  readonly yaml: YamlParserPort & YamlDocumentPort;
}

export interface HarnessPaths {
  readonly projectDir: string;
  readonly globalDir: string;
}

export interface HarnessListing {
  readonly id: string;
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly evidence: string;
}

function context(deps: HarnessDeps, paths: HarnessPaths): ProjectContext {
  return {
    projectDir: paths.projectDir,
    globalDir: paths.globalDir,
    homeDir: deps.filesystem.homeDir(),
  };
}

async function readEntries(
  deps: HarnessDeps,
  file: string,
): Promise<Map<string, boolean>> {
  if (!(await deps.filesystem.exists(file))) return new Map();
  try {
    const raw = deps.yaml.parse(await deps.filesystem.readFile(file));
    const parsed = configSchema.safeParse(raw ?? {});
    if (!parsed.success) return new Map();
    const value = parsed.data.harnesses ?? parsed.data.defaultHarnesses;
    if (value === undefined) return new Map();
    return new Map(toHarnessEntries(value).map((entry) => [entry.id, entry.enabled]));
  } catch {
    return new Map();
  }
}

/** List adapters with their enabled state and detection result. */
export async function listHarnesses(
  deps: HarnessDeps,
  adapters: readonly HarnessAdapterPort[],
  paths: HarnessPaths,
): Promise<HarnessListing[]> {
  const file = deps.filesystem.resolve(paths.projectDir, PROJECT_CONFIG_FILE);
  const entries = await readEntries(deps, file);
  const ctx = context(deps, paths);

  const listings: HarnessListing[] = [];
  for (const adapter of adapters) {
    const detection = await adapter.detect(ctx);
    listings.push({
      id: adapter.id,
      enabled: entries.size === 0 ? true : entries.get(adapter.id) === true,
      installed: detection.installed,
      evidence: detection.evidence,
    });
  }
  return listings.sort((a, b) => a.id.localeCompare(b.id));
}

/** Enable or disable a harness in `forja.yaml`, preserving other configuration. */
export async function setHarnessEnabled(
  deps: HarnessDeps,
  paths: HarnessPaths,
  id: string,
  enabled: boolean,
): Promise<void> {
  const file = deps.filesystem.resolve(paths.projectDir, PROJECT_CONFIG_FILE);
  const entries = await readEntries(deps, file);
  entries.set(id, enabled);

  const source = (await deps.filesystem.exists(file))
    ? await deps.filesystem.readFile(file)
    : "";
  const harnesses = [...entries.entries()].map(([entryId, value]) => ({
    id: entryId,
    enabled: value,
  }));
  await deps.filesystem.writeFile(file, deps.yaml.updateHarnesses(source, harnesses));
}

export interface HarnessInfo {
  readonly listing: HarnessListing;
  readonly state: HarnessState;
}

/** Inspect a single harness. */
export async function harnessInfo(
  deps: HarnessDeps,
  adapters: readonly HarnessAdapterPort[],
  paths: HarnessPaths,
  id: string,
): Promise<HarnessInfo | null> {
  const adapter = adapters.find((candidate) => candidate.id === id);
  if (!adapter) return null;

  const ctx = context(deps, paths);
  const detection = await adapter.detect(ctx);
  const file = deps.filesystem.resolve(paths.projectDir, PROJECT_CONFIG_FILE);
  const entries = await readEntries(deps, file);

  return {
    listing: {
      id: adapter.id,
      enabled: entries.size === 0 ? true : entries.get(adapter.id) === true,
      installed: detection.installed,
      evidence: detection.evidence,
    },
    state: await adapter.inspect(ctx),
  };
}
