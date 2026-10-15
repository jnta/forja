/**
 * Normalized Forja Intermediate Representation (IR).
 *
 * Adapters compile the IR, never raw YAML (PRD 33). The shapes here are the
 * domain-level contract; Phase 2 adds versioned Zod schemas that validate local
 * definitions and normalize them into these types, and Phase 9 extends the IR
 * with declarative tool/MCP metadata.
 */
import type { ComponentRef } from "./references";

export type AgentType = "primary" | "subagent";

export type ShellAccess = "none" | "readonly" | "full";

export interface AgentCapabilities {
  readonly readFiles: boolean;
  readonly writeFiles: boolean;
  readonly shell: ShellAccess;
  readonly network: boolean;
}

export interface AgentDefinition {
  readonly id: string;
  readonly description: string;
  readonly type: AgentType;
  readonly instructions: string;
  readonly capabilities: AgentCapabilities;
  /** Skill ids this agent may use. */
  readonly skills: readonly string[];
}

export interface SkillDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Markdown body from the skill's `SKILL.md`. */
  readonly instructions: string;
  /** Bundled resource paths, relative to the skill directory. */
  readonly resources: readonly string[];
  /** Declared version from `skill.yaml`, when present. */
  readonly version?: string;
  readonly category?: string;
  readonly tags: readonly string[];
  /** Declared dependencies, normalized from list or map form. */
  readonly dependencies: readonly ComponentRef[];
  /** Harness id → semver range, from `skill.yaml` compatibility. */
  readonly compatibility: Readonly<Record<string, string>>;
}

export interface WorkflowStep {
  readonly id: string;
  readonly description: string;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly description: string;
  readonly steps: readonly WorkflowStep[];
}

export interface PolicyDefinition {
  readonly id: string;
  readonly description: string;
  readonly rules: readonly string[];
}

/** A curated dependency bundle (PRD 13). */
export interface PackDefinition {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly skills: readonly ComponentRef[];
  readonly agents: readonly ComponentRef[];
  readonly workflows: readonly ComponentRef[];
  readonly policies: readonly ComponentRef[];
  /** Nested pack references, for resolution and cycle detection. */
  readonly packs: readonly ComponentRef[];
}

/**
 * Verification commands. Values are opaque strings: Forja records and forwards
 * them but never executes them during validation (PRD 22, Phase 2 acceptance).
 */
export interface VerificationDefinition {
  readonly fast: string;
  readonly full: string;
}

export interface ForjaIr {
  readonly agents: readonly AgentDefinition[];
  readonly skills: readonly SkillDefinition[];
  readonly workflows: readonly WorkflowDefinition[];
  readonly policies: readonly PolicyDefinition[];
  readonly packs: readonly PackDefinition[];
  readonly verification: VerificationDefinition;
}
