import type { Diagnostic } from "@/domain/diagnostics";
import type { SourcePackage } from "@/domain/package-source";
import type { ComponentRef } from "@/domain/references";

import {
  readDefinitions,
  type DefinitionDeps,
} from "../library/definitions";

export interface EnumeratedSource {
  readonly packages: readonly SourcePackage[];
  /** `kind:name` → dependency references declared by the package. */
  readonly dependencies: ReadonlyMap<string, readonly ComponentRef[]>;
  readonly diagnostics: readonly Diagnostic[];
}

export function packageKey(kind: string, name: string): string {
  return `${kind}:${name}`;
}

/**
 * Enumerate the packages exported by a materialized source root, reusing the
 * Phase 2 library reader. Kinds without a declared version are reported as
 * `0.0.0` and only match unpinned constraints.
 */
export async function enumeratePackages(
  deps: DefinitionDeps,
  root: string,
): Promise<EnumeratedSource> {
  const diagnostics: Diagnostic[] = [];
  const { definitions } = await readDefinitions(deps, root, diagnostics);
  const packages: SourcePackage[] = [];
  const dependencies = new Map<string, readonly ComponentRef[]>();

  for (const skill of definitions.skills.values()) {
    packages.push({
      kind: "skill",
      name: skill.id,
      version: skill.version ?? "0.0.0",
      directory: deps.filesystem.resolve(root, "skills", skill.id),
    });
    dependencies.set(packageKey("skill", skill.id), skill.dependencies);
  }
  for (const agent of definitions.agents.values()) {
    packages.push({
      kind: "agent",
      name: agent.id,
      version: "0.0.0",
      directory: deps.filesystem.resolve(root, "agents", agent.id),
    });
    dependencies.set(packageKey("agent", agent.id), []);
  }
  for (const workflow of definitions.workflows.values()) {
    packages.push({
      kind: "workflow",
      name: workflow.id,
      version: "0.0.0",
      directory: deps.filesystem.resolve(root, "workflows", `${workflow.id}.yaml`),
    });
    dependencies.set(packageKey("workflow", workflow.id), []);
  }
  for (const policy of definitions.policies.values()) {
    packages.push({
      kind: "policy",
      name: policy.id,
      version: "0.0.0",
      directory: deps.filesystem.resolve(root, "policies", `${policy.id}.yaml`),
    });
    dependencies.set(packageKey("policy", policy.id), []);
  }
  for (const pack of definitions.packs.values()) {
    packages.push({
      kind: "pack",
      name: pack.id,
      version: pack.version,
      directory: deps.filesystem.resolve(root, "packs", `${pack.id}.yaml`),
    });
    dependencies.set(packageKey("pack", pack.id), [
      ...pack.skills,
      ...pack.agents,
      ...pack.workflows,
      ...pack.policies,
      ...pack.packs,
    ]);
  }

  packages.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );
  return { packages, dependencies, diagnostics };
}
