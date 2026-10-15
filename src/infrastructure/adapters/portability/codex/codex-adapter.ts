import {
  analyzeCapabilities,
  capabilityDiagnostics,
  type CapabilityFinding,
} from "@/domain/capabilities";
import type { Diagnostic } from "@/domain/diagnostics";
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
import { CODEX_CAPABILITIES } from "./permissions";

export interface CodexCompilerAdapterOptions {
  readonly filesystem: FilesystemPort;
  readonly id?: string;
}

function unsupportedLimitations(
  findings: readonly CapabilityFinding[],
): string[] {
  return findings
    .filter((finding) => finding.state === "unsupported")
    .map((finding) => finding.message);
}

/**
 * Compiles the Forja IR into Codex configuration (PRD 32):
 *
 * - `.agents/skills/<id>/SKILL.md` (shared with OpenCode)
 * - a managed block inside `AGENTS.md` (hierarchical instructions)
 * - `.codex/agents/<id>.toml` custom agents
 *
 * Codex cannot enforce read-only files or offline network, so those agent
 * semantics are reported as unsupported unless an explicit instruction-only
 * fallback is configured. `config.toml` is never written.
 */
export class CodexCompilerAdapter implements HarnessAdapterPort {
  readonly id: string;
  private readonly filesystem: FilesystemPort;

  constructor(options: CodexCompilerAdapterOptions) {
    this.filesystem = options.filesystem;
    this.id = options.id ?? "codex";
  }

  async detect(context: ProjectContext): Promise<HarnessDetection> {
    const candidates = [".codex", ".agents", "AGENTS.md"];
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
          : "no Codex configuration found in the project",
    };
  }

  async validate(ir: ForjaIr, context: ProjectContext): Promise<readonly Diagnostic[]> {
    return ir.agents.flatMap((agent) =>
      capabilityDiagnostics(
        agent.id,
        analyzeCapabilities(agent, CODEX_CAPABILITIES, context).findings,
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
      const analysis = analyzeCapabilities(agent, CODEX_CAPABILITIES, context);
      const limitations = unsupportedLimitations(analysis.findings);
      if (limitations.length > 0 && context.instructionFallback !== true) {
        // Unsupported semantics without an explicit fallback: do not emit an
        // agent that would silently weaken safety.
        continue;
      }
      artifacts.push({
        path: this.filesystem.resolve(
          context.projectDir,
          ".codex",
          "agents",
          `${agent.id}.toml`,
        ),
        kind: "agent",
        contents: renderAgent(agent, analysis.resolved.shell, limitations),
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
      this.filesystem.resolve(context.projectDir, ".codex"),
    );
    return {
      id: this.id,
      configured,
      summary: configured
        ? "Codex project configuration present"
        : "Codex is not configured in this project",
    };
  }
}
