import type { ForjaConfig } from "@/domain/config";
import type { Diagnostic } from "@/domain/diagnostics";
import type { FilesystemPort } from "@/domain/filesystem";
import type { ForjaIr, SkillDefinition, PackDefinition } from "@/domain/ir";
import { YamlParseError, type YamlParserPort } from "@/domain/serialization";

import {
  configSchema,
  type ConfigContributionInput,
} from "../schemas";
import { mergeConfig, type ConfigLayer } from "../config/merge";
import {
  CODES,
  makeDiagnostic,
  schemaToDiagnostics,
} from "./diagnostics";
import {
  readDefinitions,
  type DefinitionMaps,
  type DefinitionsResult,
} from "./definitions";
import {
  GLOBAL_CONFIG_FILE,
  LOCAL_CONFIG_FILE,
  PROJECT_CONFIG_FILE,
  PROJECT_LIBRARY_DIR,
} from "./paths";

export interface LibraryPaths {
  readonly projectDir: string;
  readonly globalDir: string;
}

export interface LoadLibraryDeps {
  readonly filesystem: FilesystemPort;
  readonly yaml: YamlParserPort;
}

export interface LibraryResult {
  readonly ir: ForjaIr;
  readonly config: ForjaConfig;
  readonly diagnostics: readonly Diagnostic[];
  readonly directories: {
    readonly project: string;
    readonly global: string;
  };
}

async function readConfigLayer(
  deps: LoadLibraryDeps,
  file: string,
  scope: string,
  diagnostics: Diagnostic[],
): Promise<ConfigLayer | null> {
  if (!(await deps.filesystem.exists(file))) return null;

  let source: string;
  try {
    source = await deps.filesystem.readFile(file);
  } catch (error) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.missingFile,
        message: `cannot read ${file}: ${(error as Error).message}`,
        file,
      }),
    );
    return null;
  }

  let raw: unknown;
  try {
    raw = deps.yaml.parse(source, { sourceName: file });
  } catch (error) {
    if (error instanceof YamlParseError) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.invalidYaml,
          message: error.message,
          file,
          line: error.line,
          column: error.column,
        }),
      );
    } else {
      diagnostics.push(
        makeDiagnostic({ code: CODES.invalidYaml, message: (error as Error).message, file }),
      );
    }
    return null;
  }

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    diagnostics.push(...schemaToDiagnostics(result.error, { file }));
    return null;
  }

  return { scope, source: file, value: result.data };
}

function findCycle(
  nodes: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const present = new Set(nodes);
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

function mergeMaps<T>(global: Map<string, T>, project: Map<string, T>): Map<string, T> {
  const merged = new Map(global);
  for (const [id, value] of project) merged.set(id, value);
  return merged;
}

function mergeDefinitions(
  global: DefinitionMaps,
  project: DefinitionMaps,
): DefinitionMaps {
  return {
    skills: mergeMaps(global.skills, project.skills),
    agents: mergeMaps(global.agents, project.agents),
    workflows: mergeMaps(global.workflows, project.workflows),
    policies: mergeMaps(global.policies, project.policies),
    packs: mergeMaps(global.packs, project.packs),
  };
}

function detectCycles(
  skills: Map<string, SkillDefinition>,
  packs: Map<string, PackDefinition>,
  diagnostics: Diagnostic[],
): void {
  const skillEdges = new Map<string, string[]>();
  for (const [id, skill] of skills) {
    skillEdges.set(id, skill.dependencies.map((ref) => ref.name));
  }
  const skillCycle = findCycle([...skills.keys()], skillEdges);
  if (skillCycle) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.dependencyCycle,
        message: `skill dependency cycle: ${skillCycle.join(" → ")}`,
        field: "dependencies",
      }),
    );
  }

  const packEdges = new Map<string, string[]>();
  for (const [id, pack] of packs) {
    packEdges.set(id, pack.packs.map((ref) => ref.name));
  }
  const packCycle = findCycle([...packs.keys()], packEdges);
  if (packCycle) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.dependencyCycle,
        message: `pack dependency cycle: ${packCycle.join(" → ")}`,
        field: "packs",
      }),
    );
  }
}

function validateReferences(
  definitions: DefinitionMaps,
  config: ForjaConfig,
  diagnostics: Diagnostic[],
): void {
  for (const agent of definitions.agents.values()) {
    for (const skill of agent.skills) {
      if (!definitions.skills.has(skill)) {
        diagnostics.push(
          makeDiagnostic({
            code: CODES.missingReference,
            message: `agent "${agent.id}" references unknown skill "${skill}"`,
            field: "skills",
          }),
        );
      }
    }
  }

  const configRefs: ReadonlyArray<{ name: string; kind: "skill" | "agent" | "workflow" | "policy" }> = [
    ...config.skills.map((ref) => ({ name: ref.name, kind: "skill" as const })),
    ...config.agents.map((ref) => ({ name: ref.name, kind: "agent" as const })),
    ...config.workflows.map((ref) => ({ name: ref.name, kind: "workflow" as const })),
    ...config.policies.map((ref) => ({ name: ref.name, kind: "policy" as const })),
  ];
  const available = {
    skill: definitions.skills,
    agent: definitions.agents,
    workflow: definitions.workflows,
    policy: definitions.policies,
  };
  for (const ref of configRefs) {
    if (!available[ref.kind].has(ref.name)) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.configReferenceNotFound,
          severity: "warning",
          message: `configuration references ${ref.kind} "${ref.name}", which is not installed locally`,
          resolution: "Install it with `forja add`, or remove it from forja.yaml.",
        }),
      );
    }
  }
}

function buildIr(definitions: DefinitionMaps, config: ForjaConfig): ForjaIr {
  return {
    agents: [...definitions.agents.values()].sort((a, b) => a.id.localeCompare(b.id)),
    skills: [...definitions.skills.values()].sort((a, b) => a.id.localeCompare(b.id)),
    workflows: [...definitions.workflows.values()].sort((a, b) => a.id.localeCompare(b.id)),
    policies: [...definitions.policies.values()].sort((a, b) => a.id.localeCompare(b.id)),
    packs: [...definitions.packs.values()].sort((a, b) => a.id.localeCompare(b.id)),
    verification: config.verification,
  };
}

function packLayers(
  result: DefinitionsResult,
  scope: string,
): ConfigLayer[] {
  return [...result.packConfigs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((pack): ConfigLayer => ({
      scope,
      source: `pack:${pack.id}`,
      value: pack.config,
    }));
}

function policyLayers(
  result: DefinitionsResult,
  scope: string,
): ConfigLayer[] {
  return result.policyContributions.map((value, index): ConfigLayer => ({
    scope,
    source: `policy:${scope}:${index}`,
    value: value as ConfigContributionInput,
  }));
}

/** Load the global and project libraries, merge configuration and build the IR. */
export async function loadLibrary(
  deps: LoadLibraryDeps,
  paths: LibraryPaths,
): Promise<LibraryResult> {
  const diagnostics: Diagnostic[] = [];
  const projectRoot = deps.filesystem.resolve(paths.projectDir, PROJECT_LIBRARY_DIR);

  const [globalConfig, projectConfig, localConfig] = await Promise.all([
    readConfigLayer(
      deps,
      deps.filesystem.resolve(paths.globalDir, GLOBAL_CONFIG_FILE),
      "global",
      diagnostics,
    ),
    readConfigLayer(
      deps,
      deps.filesystem.resolve(paths.projectDir, PROJECT_CONFIG_FILE),
      "project",
      diagnostics,
    ),
    readConfigLayer(
      deps,
      deps.filesystem.resolve(paths.projectDir, LOCAL_CONFIG_FILE),
      "local",
      diagnostics,
    ),
  ]);

  const globalDefinitions = await readDefinitions(deps, paths.globalDir, diagnostics);
  const projectDefinitions = await readDefinitions(deps, projectRoot, diagnostics);

  const layers: ConfigLayer[] = [
    { scope: "defaults", source: "<defaults>", value: {} },
    ...(globalConfig ? [globalConfig] : []),
    ...policyLayers(globalDefinitions, "global"),
    ...packLayers(globalDefinitions, "packs"),
    ...packLayers(projectDefinitions, "packs"),
    ...(projectConfig ? [projectConfig] : []),
    ...policyLayers(projectDefinitions, "project"),
    ...(localConfig ? [localConfig] : []),
  ];

  const config = mergeConfig(layers, diagnostics);
  const definitions = mergeDefinitions(
    globalDefinitions.definitions,
    projectDefinitions.definitions,
  );

  validateReferences(definitions, config, diagnostics);
  detectCycles(definitions.skills, definitions.packs, diagnostics);

  const ir = buildIr(definitions, config);

  return {
    ir,
    config,
    diagnostics,
    directories: { project: projectRoot, global: paths.globalDir },
  };
}
