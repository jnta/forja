import type { VerificationDefinition } from "./ir";
import type { ComponentRef } from "./references";

/** A harness toggle, normalized from either list or map form. */
export interface HarnessEntry {
  readonly id: string;
  readonly enabled: boolean;
}

/**
 * Fully merged, canonical configuration. Produced by applying the documented
 * precedence chain (defaults → global → packs → project → forja.local.yaml).
 */
export interface ForjaConfig {
  /** Config schema version. */
  readonly version: number;
  readonly harnesses: readonly HarnessEntry[];
  readonly agents: readonly ComponentRef[];
  readonly skills: readonly ComponentRef[];
  readonly workflows: readonly ComponentRef[];
  readonly policies: readonly ComponentRef[];
  readonly verification: VerificationDefinition;
  /** Compatibility strict mode (PRD 34): unsupported semantics become errors. */
  readonly strict: boolean;
  /** Allow instruction-only fallbacks for unsupported agent semantics. */
  readonly instructionFallback: boolean;
}

export const CONFIG_SCOPE_ORDER = [
  "defaults",
  "global",
  "packs",
  "project",
  "local",
] as const;

export type ConfigScope = (typeof CONFIG_SCOPE_ORDER)[number];
