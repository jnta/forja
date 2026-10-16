import { declarationDiagnostics } from "@/domain/capabilities";
import type { Diagnostic } from "@/domain/diagnostics";
import type { FilesystemPort } from "@/domain/filesystem";
import {
  validateAdapterId,
  type GeneratedArtifact,
  type HarnessAdapterPort,
  type HarnessDetection,
  type HarnessState,
  type ProjectContext,
} from "@/domain/harness-adapter";
import type { ForjaIr } from "@/domain/ir";

import { composeManagedFile, renderInstructionsBlock } from "../shared/instructions";
import { skillArtifacts } from "../shared/skills";

export interface SampleAdapterOptions {
  readonly filesystem: FilesystemPort;
  readonly id?: string;
}

/**
 * Sample compiler adapter for adapter authors (see
 * docs/decisions/0009-extensions-and-catalog.md). It writes everything under
 * `.sample/` and is not registered by default. Copy this shape, implement the
 * four `HarnessAdapterPort` methods, and register the adapter in the CLI
 * composition root (`src/cli/container.ts`).
 */
export class SampleCompilerAdapter implements HarnessAdapterPort {
  readonly id: string;
  private readonly filesystem: FilesystemPort;

  constructor(options: SampleAdapterOptions) {
    this.filesystem = options.filesystem;
    this.id = options.id ?? "sample";
    validateAdapterId(this.id);
  }

  async detect(context: ProjectContext): Promise<HarnessDetection> {
    const configured = await this.filesystem.exists(
      this.filesystem.resolve(context.projectDir, ".sample"),
    );
    return {
      installed: configured,
      evidence: configured ? "found .sample" : "no sample configuration found",
    };
  }

  async validate(ir: ForjaIr, context: ProjectContext): Promise<readonly Diagnostic[]> {
    return declarationDiagnostics(ir, this.id, context);
  }

  async compile(ir: ForjaIr, context: ProjectContext): Promise<readonly GeneratedArtifact[]> {
    const artifacts: GeneratedArtifact[] = [];
    const skillsDir = this.filesystem.resolve(context.projectDir, ".sample", "skills");
    for (const skill of ir.skills) {
      artifacts.push(...(await skillArtifacts(this.filesystem, skillsDir, skill)));
    }
    for (const agent of ir.agents) {
      artifacts.push({
        path: this.filesystem.resolve(context.projectDir, ".sample", "agents", `${agent.id}.md`),
        kind: "agent",
        contents: `# ${agent.id}\n\n${agent.instructions.trim()}\n`,
      });
    }
    const block = renderInstructionsBlock({
      workflows: ir.workflows,
      policies: ir.policies,
      verification: ir.verification,
      tools: ir.tools,
      mcpServers: ir.mcpServers,
    });
    if (block.length > 0) {
      const target = this.filesystem.resolve(context.projectDir, ".sample", "AGENTS.md");
      const existing = (await this.filesystem.exists(target))
        ? await this.filesystem.readFile(target)
        : null;
      artifacts.push({
        path: target,
        kind: "instructions",
        contents: composeManagedFile(existing, block),
        merge: true,
      });
    }
    return artifacts;
  }

  async inspect(context: ProjectContext): Promise<HarnessState> {
    const configured = await this.filesystem.exists(
      this.filesystem.resolve(context.projectDir, ".sample"),
    );
    return { id: this.id, configured, summary: configured ? "sample present" : "sample absent" };
  }
}
