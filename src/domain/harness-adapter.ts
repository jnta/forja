/**
 * Harness adapter boundary (PRD 31).
 *
 * Compiler adapters consume the normalized Forja IR and produce a desired set
 * of files (`GeneratedArtifact[]`). They never write to disk themselves: the
 * safe sync writer (Phase 4) plans, diffs and applies artifacts. This port is
 * deliberately distinct from the runtime `CodingHarnessPort` in `ports.ts`.
 *
 * The contract is introduced in Phase 1 and implemented by real adapters in
 * Phases 5–6.
 */
import type { Diagnostic } from "./diagnostics";
import { ForjaError } from "./errors";
import type { ForjaIr } from "./ir";

export interface ProjectContext {
  /** Root of the target project. */
  readonly projectDir: string;
  /** Root of the global Forja library (e.g. `~/.forja`). */
  readonly globalDir: string;
  readonly homeDir: string;
  /** Output scope: project configuration or global (personal) configuration. */
  readonly scope?: "project" | "global";
  /** Strict compatibility: degraded semantics become errors. */
  readonly strict?: boolean;
  /** Allow instruction-only fallbacks for unsupported agent semantics. */
  readonly instructionFallback?: boolean;
}

export interface HarnessDetection {
  readonly installed: boolean;
  readonly version?: string;
  /** Human-readable evidence, e.g. a discovered config path or CLI version. */
  readonly evidence: string;
}

export type ArtifactKind =
  | "skill"
  | "agent"
  | "instructions"
  | "policy"
  | "workflow"
  | "resource"
  | "config";

export interface GeneratedArtifact {
  /** Absolute target path. */
  readonly path: string;
  readonly kind: ArtifactKind;
  readonly contents: string;
  /**
   * True for artifacts that merge into an existing file by replacing a managed
   * block (e.g. `AGENTS.md`). The desired contents already incorporate the
   * current manual content, so adopting an unowned file is safe.
   */
  readonly merge?: boolean;
}

export interface HarnessState {
  readonly id: string;
  readonly configured: boolean;
  readonly summary: string;
}

export interface HarnessAdapterPort {
  /** Stable adapter id, e.g. `opencode`. */
  readonly id: string;
  detect(context: ProjectContext): Promise<HarnessDetection>;
  validate(
    ir: ForjaIr,
    context: ProjectContext,
  ): Promise<readonly Diagnostic[]>;
  compile(
    ir: ForjaIr,
    context: ProjectContext,
  ): Promise<readonly GeneratedArtifact[]>;
  inspect(context: ProjectContext): Promise<HarnessState>;
}

/** Adapter ids that are reserved by Forja itself. */
export const RESERVED_ADAPTER_IDS: readonly string[] = ["forja", "core", "system"];

const ADAPTER_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Validate an adapter id; throws a `ForjaError` when it is unusable. */
export function validateAdapterId(id: string): void {
  if (!ADAPTER_ID_PATTERN.test(id)) {
    throw new ForjaError(
      `invalid adapter id "${id}": use lowercase kebab-case`,
      "FORJA-COMPAT-003",
      { kind: "config" },
    );
  }
  if (RESERVED_ADAPTER_IDS.includes(id)) {
    throw new ForjaError(`adapter id "${id}" is reserved`, "FORJA-COMPAT-003", {
      kind: "config",
    });
  }
}
