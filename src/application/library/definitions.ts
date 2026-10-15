import path from "node:path";

import { z } from "zod";

import type { Diagnostic } from "@/domain/diagnostics";
import type { FilesystemPort } from "@/domain/filesystem";
import type {
  AgentDefinition,
  PackDefinition,
  PolicyDefinition,
  ShellAccess,
  SkillDefinition,
  WorkflowDefinition,
} from "@/domain/ir";
import type { ComponentKind, ComponentRef } from "@/domain/references";
import { YamlParseError, type YamlParserPort } from "@/domain/serialization";

import {
  agentSchema,
  documentFrontmatterSchema,
  packSchema,
  policySchema,
  skillFrontmatterSchema,
  skillMetadataSchema,
  workflowSchema,
  type ConfigContributionInput,
  type SkillMetadata,
} from "../schemas";
import {
  isSchemaIssue,
  parseComponentRef,
  toNameList,
} from "../schemas/common";
import { CODES, makeDiagnostic, schemaToDiagnostics } from "./diagnostics";
import { splitFrontmatter } from "./frontmatter";
import {
  AGENT_ENTRY,
  AGENT_MANIFEST,
  DEFINITION_DIRS,
  SKILL_ENTRY,
  SKILL_MANIFEST,
  SKILL_RESOURCE_DIRS,
} from "./paths";

export interface DefinitionMaps {
  readonly skills: Map<string, SkillDefinition>;
  readonly agents: Map<string, AgentDefinition>;
  readonly workflows: Map<string, WorkflowDefinition>;
  readonly policies: Map<string, PolicyDefinition>;
  readonly packs: Map<string, PackDefinition>;
}

export interface DefinitionsResult {
  readonly definitions: DefinitionMaps;
  readonly packConfigs: ReadonlyArray<{
    readonly id: string;
    readonly config: ConfigContributionInput;
  }>;
  /** Verification declared inside policies, applied at the policy's scope. */
  readonly policyContributions: readonly ConfigContributionInput[];
}

export interface DefinitionDeps {
  readonly filesystem: FilesystemPort;
  readonly yaml: YamlParserPort;
}

const COMPONENT_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

async function readText(
  deps: DefinitionDeps,
  target: string,
  diagnostics: Diagnostic[],
): Promise<string | null> {
  try {
    return await deps.filesystem.readFile(target);
  } catch (error) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.missingFile,
        message: `cannot read ${target}: ${(error as Error).message}`,
        file: target,
      }),
    );
    return null;
  }
}

async function parseYaml(
  deps: DefinitionDeps,
  source: string,
  target: string,
  diagnostics: Diagnostic[],
): Promise<unknown | null> {
  try {
    return deps.yaml.parse(source, { sourceName: target });
  } catch (error) {
    if (error instanceof YamlParseError) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.invalidYaml,
          message: error.message,
          file: target,
          line: error.line,
          column: error.column,
        }),
      );
    } else {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.invalidYaml,
          message: (error as Error).message,
          file: target,
        }),
      );
    }
    return null;
  }
}

function validate<T>(
  schema: z.ZodType<T>,
  value: unknown,
  file: string,
  diagnostics: Diagnostic[],
  baseField?: string,
): T | null {
  const result = schema.safeParse(value);
  if (!result.success) {
    diagnostics.push(...schemaToDiagnostics(result.error, { file, baseField }));
    return null;
  }
  return result.data;
}

function parseRefs(
  kind: ComponentKind,
  values: readonly string[],
  file: string,
  field: string,
  diagnostics: Diagnostic[],
): ComponentRef[] {
  const refs: ComponentRef[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const parsed = parseComponentRef(kind, value);
    if (isSchemaIssue(parsed)) {
      diagnostics.push(
        makeDiagnostic({ code: CODES.invalidSchema, message: parsed.message, file, field }),
      );
      continue;
    }
    if (seen.has(parsed.name)) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.duplicateId,
          message: `duplicate ${kind} reference "${parsed.name}"`,
          file,
          field,
        }),
      );
      continue;
    }
    seen.add(parsed.name);
    refs.push(parsed);
  }
  return refs.sort((a, b) => a.name.localeCompare(b.name));
}

function toShellAccess(
  shell: ShellAccess | { enabled: boolean; mutating?: boolean },
): ShellAccess {
  if (typeof shell === "string") return shell;
  if (!shell.enabled) return "none";
  return shell.mutating === true ? "full" : "readonly";
}

async function walk(
  filesystem: FilesystemPort,
  absolute: string,
  prefix: string,
  out: string[],
): Promise<void> {
  const entries = (await filesystem.readDir(absolute)).sort();
  for (const name of entries) {
    const child = filesystem.resolve(absolute, name);
    const info = await filesystem.stat(child);
    if (!info) continue;
    const relative = `${prefix}/${name}`;
    if (info.type === "directory") {
      await walk(filesystem, child, relative, out);
    } else {
      out.push(relative);
    }
  }
}

function isUnsafeRelative(relative: string): boolean {
  if (path.isAbsolute(relative)) return true;
  return relative.split(/[\\/]/).some((segment) => segment === "..");
}

async function resolveResources(
  deps: DefinitionDeps,
  directory: string,
  declared: readonly string[],
  diagnostics: Diagnostic[],
  file: string,
): Promise<string[]> {
  const discovered: string[] = [];
  for (const sub of SKILL_RESOURCE_DIRS) {
    const subDir = deps.filesystem.resolve(directory, sub);
    if (await deps.filesystem.exists(subDir)) {
      await walk(deps.filesystem, subDir, sub, discovered);
    }
  }

  const candidates = [...new Set([...declared, ...discovered])].sort();
  const base = await deps.filesystem.realpath(directory);
  const safe: string[] = [];

  for (const relative of candidates) {
    if (isUnsafeRelative(relative)) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.unsafePath,
          message: `resource "${relative}" escapes the skill directory`,
          file,
          field: "resources",
        }),
      );
      continue;
    }

    const absolute = deps.filesystem.resolve(directory, relative);
    if (!(await deps.filesystem.exists(absolute))) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.missingFile,
          message: `declared resource "${relative}" does not exist`,
          file,
          field: "resources",
        }),
      );
      continue;
    }

    let real: string;
    try {
      real = await deps.filesystem.realpath(absolute);
    } catch {
      real = absolute;
    }
    if (real !== base && !real.startsWith(`${base}${path.sep}`)) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.unsafePath,
          message: `resource "${relative}" resolves outside the skill directory`,
          file,
          field: "resources",
        }),
      );
      continue;
    }

    safe.push(relative);
  }

  return safe.sort();
}

async function readSkill(
  deps: DefinitionDeps,
  skillsDir: string,
  id: string,
  diagnostics: Diagnostic[],
): Promise<SkillDefinition | null> {
  const directory = deps.filesystem.resolve(skillsDir, id);
  const entryPath = deps.filesystem.resolve(directory, SKILL_ENTRY);

  if (!(await deps.filesystem.exists(entryPath))) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.missingFile,
        message: `${id} is missing ${SKILL_ENTRY}`,
        file: entryPath,
      }),
    );
    return null;
  }

  const source = await readText(deps, entryPath, diagnostics);
  if (source === null) return null;

  const frontmatter = splitFrontmatter(source);
  if (!frontmatter.ok) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.invalidFrontmatter,
        message: frontmatter.message,
        file: entryPath,
      }),
    );
    return null;
  }
  if (frontmatter.value.yaml === null) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.invalidFrontmatter,
        message: `${SKILL_ENTRY} must start with frontmatter containing "name" and "description"`,
        file: entryPath,
      }),
    );
    return null;
  }

  const parsedYaml = await parseYaml(deps, frontmatter.value.yaml, entryPath, diagnostics);
  if (parsedYaml === null) return null;
  const front = validate(skillFrontmatterSchema, parsedYaml, entryPath, diagnostics, "frontmatter");
  if (front === null) return null;

  if (front.name !== id) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.invalidName,
        message: `skill name "${front.name}" does not match directory "${id}"`,
        file: entryPath,
        field: "frontmatter.name",
      }),
    );
    return null;
  }

  let metadata: SkillMetadata = {};
  const manifestPath = deps.filesystem.resolve(directory, SKILL_MANIFEST);
  if (await deps.filesystem.exists(manifestPath)) {
    const manifestSource = await readText(deps, manifestPath, diagnostics);
    if (manifestSource === null) return null;
    const manifestYaml = await parseYaml(deps, manifestSource, manifestPath, diagnostics);
    if (manifestYaml === null) return null;
    const meta = validate(skillMetadataSchema, manifestYaml, manifestPath, diagnostics);
    if (meta === null) return null;
    metadata = meta;
  }

  const resources = await resolveResources(
    deps,
    directory,
    metadata.resources ?? [],
    diagnostics,
    entryPath,
  );
  const dependencies = parseRefs(
    "skill",
    metadata.dependencies ? toNameList(metadata.dependencies) : [],
    manifestPath,
    "dependencies",
    diagnostics,
  );

  return {
    id,
    name: front.name,
    description: front.description,
    instructions: frontmatter.value.body.trim(),
    resources,
    version: metadata.version,
    category: metadata.category,
    tags: (metadata.tags ?? []).slice().sort(),
    dependencies,
    compatibility: metadata.compatibility ?? {},
  };
}

async function readAgent(
  deps: DefinitionDeps,
  agentsDir: string,
  id: string,
  diagnostics: Diagnostic[],
): Promise<AgentDefinition | null> {
  const directory = deps.filesystem.resolve(agentsDir, id);
  const manifestPath = deps.filesystem.resolve(directory, AGENT_MANIFEST);
  const entryPath = deps.filesystem.resolve(directory, AGENT_ENTRY);

  if (!(await deps.filesystem.exists(manifestPath))) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.missingFile,
        message: `${id} is missing ${AGENT_MANIFEST}`,
        file: manifestPath,
      }),
    );
    return null;
  }
  if (!(await deps.filesystem.exists(entryPath))) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.missingFile,
        message: `${id} is missing ${AGENT_ENTRY}`,
        file: entryPath,
      }),
    );
    return null;
  }

  const manifestSource = await readText(deps, manifestPath, diagnostics);
  if (manifestSource === null) return null;
  const manifestYaml = await parseYaml(deps, manifestSource, manifestPath, diagnostics);
  if (manifestYaml === null) return null;
  const agent = validate(agentSchema, manifestYaml, manifestPath, diagnostics);
  if (agent === null) return null;

  if (agent.name !== undefined && agent.name !== id) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.invalidName,
        message: `agent name "${agent.name}" does not match directory "${id}"`,
        file: manifestPath,
        field: "name",
      }),
    );
    return null;
  }

  const entrySource = await readText(deps, entryPath, diagnostics);
  if (entrySource === null) return null;
  const frontmatter = splitFrontmatter(entrySource);
  if (!frontmatter.ok) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.invalidFrontmatter,
        message: frontmatter.message,
        file: entryPath,
      }),
    );
    return null;
  }

  let documentDescription: string | undefined;
  if (frontmatter.value.yaml !== null && frontmatter.value.yaml.trim().length > 0) {
    const frontYaml = await parseYaml(deps, frontmatter.value.yaml, entryPath, diagnostics);
    if (frontYaml === null) return null;
    const front = validate(
      documentFrontmatterSchema,
      frontYaml,
      entryPath,
      diagnostics,
      "frontmatter",
    );
    if (front === null) return null;
    if (front.name !== undefined && front.name !== id) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.invalidName,
          message: `agent name "${front.name}" does not match directory "${id}"`,
          file: entryPath,
          field: "frontmatter.name",
        }),
      );
      return null;
    }
    documentDescription = front.description;
  }

  const instructions = frontmatter.value.body.trim();
  const description =
    agent.description ??
    documentDescription ??
    instructions.split("\n").find((line) => line.trim().length > 0)?.trim() ??
    id;

  const skillRefs = parseRefs(
    "skill",
    toNameList(agent.skills),
    manifestPath,
    "skills",
    diagnostics,
  );

  return {
    id,
    description,
    type: agent.type,
    instructions,
    capabilities: {
      readFiles: agent.capabilities.filesystem.read,
      writeFiles: agent.capabilities.filesystem.write,
      shell: toShellAccess(agent.capabilities.shell),
      network: agent.capabilities.network ?? false,
    },
    skills: skillRefs.map((ref) => ref.name),
  };
}

async function readSingleFileDefinitions<T>(
  deps: DefinitionDeps,
  directory: string,
  kind: ComponentKind,
  build: (id: string, value: unknown, file: string, diagnostics: Diagnostic[]) => T | null,
  diagnostics: Diagnostic[],
): Promise<T[]> {
  if (!(await deps.filesystem.exists(directory))) return [];

  const results: T[] = [];
  const seen = new Set<string>();
  const entries = (await deps.filesystem.readDir(directory))
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort();

  for (const entry of entries) {
    const id = entry.replace(/\.ya?ml$/, "");
    const file = deps.filesystem.resolve(directory, entry);
    if (!COMPONENT_ID_PATTERN.test(id)) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.invalidName,
          message: `${kind} id "${id}" must be lowercase kebab-case`,
          file,
        }),
      );
      continue;
    }
    if (seen.has(id)) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.duplicateId,
          message: `duplicate ${kind} id "${id}"`,
          file,
        }),
      );
      continue;
    }
    seen.add(id);
    const source = await readText(deps, file, diagnostics);
    if (source === null) continue;
    const value = await parseYaml(deps, source, file, diagnostics);
    if (value === null) continue;
    const built = build(id, value, file, diagnostics);
    if (built !== null) results.push(built);
  }

  return results;
}

/** Read every definition under a library root (global or project scope). */
export async function readDefinitions(
  deps: DefinitionDeps,
  root: string,
  diagnostics: Diagnostic[],
): Promise<DefinitionsResult> {
  const skills = new Map<string, SkillDefinition>();
  const agents = new Map<string, AgentDefinition>();
  const workflows = new Map<string, WorkflowDefinition>();
  const policies = new Map<string, PolicyDefinition>();
  const packs = new Map<string, PackDefinition>();
  const packConfigs: { id: string; config: ConfigContributionInput }[] = [];
  const policyContributions: ConfigContributionInput[] = [];

  const skillsDir = deps.filesystem.resolve(root, DEFINITION_DIRS.skills);
  if (await deps.filesystem.exists(skillsDir)) {
    for (const id of (await deps.filesystem.readDir(skillsDir)).sort()) {
      const info = await deps.filesystem.stat(deps.filesystem.resolve(skillsDir, id));
      if (!info || info.type !== "directory") continue;
      if (!COMPONENT_ID_PATTERN.test(id)) {
        diagnostics.push(
          makeDiagnostic({
            code: CODES.invalidName,
            message: `skill id "${id}" must be lowercase kebab-case`,
            file: deps.filesystem.resolve(skillsDir, id),
          }),
        );
        continue;
      }
      const skill = await readSkill(deps, skillsDir, id, diagnostics);
      if (skill !== null) skills.set(id, skill);
    }
  }

  const agentsDir = deps.filesystem.resolve(root, DEFINITION_DIRS.agents);
  if (await deps.filesystem.exists(agentsDir)) {
    for (const id of (await deps.filesystem.readDir(agentsDir)).sort()) {
      const info = await deps.filesystem.stat(deps.filesystem.resolve(agentsDir, id));
      if (!info || info.type !== "directory") continue;
      if (!COMPONENT_ID_PATTERN.test(id)) {
        diagnostics.push(
          makeDiagnostic({
            code: CODES.invalidName,
            message: `agent id "${id}" must be lowercase kebab-case`,
            file: deps.filesystem.resolve(agentsDir, id),
          }),
        );
        continue;
      }
      const agent = await readAgent(deps, agentsDir, id, diagnostics);
      if (agent !== null) agents.set(id, agent);
    }
  }

  const workflowItems = await readSingleFileDefinitions(
    deps,
    deps.filesystem.resolve(root, DEFINITION_DIRS.workflows),
    "workflow",
    (id, value, file, diags) => {
      const workflow = validate(workflowSchema, value, file, diags);
      if (workflow === null) return null;
      if (workflow.name !== undefined && workflow.name !== id) {
        diags.push(
          makeDiagnostic({
            code: CODES.invalidName,
            message: `workflow name "${workflow.name}" does not match file "${id}"`,
            file,
            field: "name",
          }),
        );
        return null;
      }
      return {
        id,
        description: workflow.description ?? id,
        steps: workflow.steps.map((step) =>
          typeof step === "string"
            ? { id: step, description: "" }
            : { id: step.id, description: step.description ?? "" },
        ),
      } satisfies WorkflowDefinition;
    },
    diagnostics,
  );
  for (const workflow of workflowItems) workflows.set(workflow.id, workflow);

  const policyItems = await readSingleFileDefinitions(
    deps,
    deps.filesystem.resolve(root, DEFINITION_DIRS.policies),
    "policy",
    (id, value, file, diags) => {
      const policy = validate(policySchema, value, file, diags);
      if (policy === null) return null;
      return { id, policy };
    },
    diagnostics,
  );
  for (const item of policyItems) {
    policies.set(item.id, {
      id: item.id,
      description: item.policy.description ?? item.id,
      rules: item.policy.rules.slice().sort(),
    });
    if (item.policy.verification) {
      policyContributions.push({ verification: item.policy.verification });
    }
  }

  const packItems = await readSingleFileDefinitions(
    deps,
    deps.filesystem.resolve(root, DEFINITION_DIRS.packs),
    "pack",
    (id, value, file, diags) => {
      const pack = validate(packSchema, value, file, diags);
      if (pack === null) return null;
      if (pack.name !== undefined && pack.name !== id) {
        diags.push(
          makeDiagnostic({
            code: CODES.invalidName,
            message: `pack name "${pack.name}" does not match file "${id}"`,
            file,
            field: "name",
          }),
        );
        return null;
      }
      return { id, pack, file };
    },
    diagnostics,
  );
  for (const item of packItems) {
    packs.set(item.id, {
      id: item.id,
      version: item.pack.version,
      description: item.pack.description ?? item.id,
      skills: parseRefs("skill", item.pack.skills ? toNameList(item.pack.skills) : [], item.file, "skills", diagnostics),
      agents: parseRefs("agent", item.pack.agents ? toNameList(item.pack.agents) : [], item.file, "agents", diagnostics),
      workflows: parseRefs("workflow", item.pack.workflows ? toNameList(item.pack.workflows) : [], item.file, "workflows", diagnostics),
      policies: parseRefs("policy", item.pack.policies ? toNameList(item.pack.policies) : [], item.file, "policies", diagnostics),
      packs: parseRefs("pack", item.pack.packs ? toNameList(item.pack.packs) : [], item.file, "packs", diagnostics),
    });
    if (item.pack.config) packConfigs.push({ id: item.id, config: item.pack.config });
  }

  return {
    definitions: { skills, agents, workflows, policies, packs },
    packConfigs,
    policyContributions,
  };
}
