import type { Diagnostic } from "@/domain/diagnostics";
import type {
  GeneratedArtifact,
  HarnessAdapterPort,
  HarnessDetection,
  HarnessState,
  ProjectContext,
} from "@/domain/harness-adapter";
import type { ForjaIr } from "@/domain/ir";

export interface FixtureArtifactSpec {
  readonly path: string;
  readonly contents: string;
  readonly kind?: GeneratedArtifact["kind"];
}

export interface FixtureAdapterOptions {
  readonly id: string;
  readonly artifacts: (ir: ForjaIr, context: ProjectContext) => FixtureArtifactSpec[];
  readonly diagnostics?: readonly Diagnostic[];
}

/** Minimal adapter used to test the sync planner/writer without a real harness. */
export function createFixtureAdapter(
  options: FixtureAdapterOptions,
): HarnessAdapterPort {
  return {
    id: options.id,
    async detect(): Promise<HarnessDetection> {
      return { installed: true, evidence: "fixture" };
    },
    async validate(): Promise<readonly Diagnostic[]> {
      return options.diagnostics ?? [];
    },
    async compile(ir: ForjaIr, context: ProjectContext): Promise<readonly GeneratedArtifact[]> {
      return options.artifacts(ir, context).map((artifact) => ({
        path: artifact.path,
        kind: artifact.kind ?? "instructions",
        contents: artifact.contents,
      }));
    },
    async inspect(): Promise<HarnessState> {
      return { id: options.id, configured: true, summary: "fixture" };
    },
  };
}
