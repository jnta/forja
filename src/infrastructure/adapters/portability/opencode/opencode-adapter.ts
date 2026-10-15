import type { Diagnostic } from "@/domain/diagnostics";
import {
  analyzeCapabilities,
  capabilityDiagnostics,
} from "@/domain/capabilities";
import type { FilesystemPort } from "@/domain/filesystem";
import type {
  GeneratedArtifact,
  HarnessAdapterPort,
  HarnessDetection,
  HarnessState,
  ProjectContext,
} from "@/domain/harness-adapter";
import type { ForjaIr } from "@/domain/ir";

import { composeManagedFile, renderInstructionsBlock } from "../shared/instructions";
import { skillArtifacts } from "../shared/skills";
import { renderAgent } from "./agents";
import { OPENCODE_CAPABILITIES } from "./permissions";

export interface OpenCodeCompilerAdapterOptions {
  readonly filesystem: FilesystemPort;
  readonly id?: string;
}

/**
 * Compiles the Forja IR into OpenCode configuration (PRD 31–32):
 *
 * - `.agents/skills/<id>/SKILL.md` (+ bundled resources, shared with Codex)
 * - `.opencode/agents/<id>.md` (primary/subagent roles + permissions)
 * - a managed block inside `AGENTS.md`, preserving manual content
 *
 * It never writes `opencode.json`, so existing user configuration is preserved.
 * Distinct from the runtime execution adapters in `adapters/opencode/`.
 */
export class OpenCodeCompilerAdapter implements HarnessAdapterPort {
  readonly id: string;
  private readonly filesystem: FilesystemPort;

  constructor(options: OpenCodeCompilerAdapterOptions) {
    this.filesystem = options.filesystem;
    this.id = options.id ?? "opencode";
  }

  async detect(context: ProjectContext): Promise<HarnessDetection> {
    const candidates = ["opencode.json", ".opencode", ".agents"];
    const found: string[] = [];
    for (const candidate of candidates) {
      if (await this.filesystem.exists(this.filesystem.resolve(context.projectDir, candidate))) {
        found.push(candidate);
      }
    }
    return {
      installed: found.length > 0,
      evidence:
        found.length > 0
          ? `found ${found.join(", ")}`
          : "no OpenCode configuration found in the project",
    };
  }

  async validate(ir: ForjaIr, context: ProjectContext): Promise<readonly Diagnostic[]> {
    return ir.agents.flatMap((agent) =>
      capabilityDiagnostics(
        agent.id,
        analyzeCapabilities(agent, OPENCODE_CAPABILITIES, context).findings,
        context,
      ),
    );
  }

  async compile(ir: ForjaIr, context: ProjectContext): Promise<readonly GeneratedArtifact[]> {
    const artifacts: GeneratedArtifact[] = [];
    const skillsDir = this.filesystem.resolve(context.projectDir, ".agents", "skills");

    for (const skill of ir.skills) {
      artifacts.push(...(await skillArtifacts(this.filesystem, skillsDir, skill)));
    }

    for (const agent of ir.agents) {
      const { resolved } = analyzeCapabilities(agent, OPENCODE_CAPABILITIES, context);
      artifacts.push({
        path: this.filesystem.resolve(
          context.projectDir,
          ".opencode",
          "agents",
          `${agent.id}.md`,
        ),
        kind: "agent",
        contents: renderAgent(agent, resolved.shell),
      });
    }

    const block = renderInstructionsBlock({
      workflows: ir.workflows,
      policies: ir.policies,
      verification: ir.verification,
    });
    if (block.length > 0) {
      const agentsMd = this.filesystem.resolve(context.projectDir, "AGENTS.md");
      const existing = (await this.filesystem.exists(agentsMd))
        ? await this.filesystem.readFile(agentsMd)
        : null;
      artifacts.push({
        path: agentsMd,
        kind: "instructions",
        contents: composeManagedFile(existing, block),
        merge: true,
      });
    }

    return artifacts;
  }

  async inspect(context: ProjectContext): Promise<HarnessState> {
    const configured = await this.filesystem.exists(
      this.filesystem.resolve(context.projectDir, ".opencode"),
    );
    return {
      id: this.id,
      configured,
      summary: configured
        ? "OpenCode project configuration present"
        : "OpenCode is not configured in this project",
    };
  }
}
