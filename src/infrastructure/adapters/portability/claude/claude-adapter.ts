import {
  analyzeCapabilities,
  capabilityDiagnostics,
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
import { CLAUDE_CAPABILITIES } from "./permissions";

export interface ClaudeCompilerAdapterOptions {
  readonly filesystem: FilesystemPort;
  readonly id?: string;
}

/**
 * Compiles the Forja IR into Claude Code configuration (PRD 32):
 *
 * - `.claude/skills/<id>/SKILL.md` (+ bundled resources)
 * - `.claude/agents/<id>.md` (subagents with a tool allowlist)
 * - a managed block inside `CLAUDE.md`, preserving manual content
 *
 * It never writes `.claude/settings.json`, so existing user configuration is
 * preserved.
 */
export class ClaudeCompilerAdapter implements HarnessAdapterPort {
  readonly id: string;
  private readonly filesystem: FilesystemPort;

  constructor(options: ClaudeCompilerAdapterOptions) {
    this.filesystem = options.filesystem;
    this.id = options.id ?? "claude-code";
  }

  async detect(context: ProjectContext): Promise<HarnessDetection> {
    const candidates = [".claude", "CLAUDE.md"];
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
          : "no Claude Code configuration found in the project",
    };
  }

  async validate(ir: ForjaIr, context: ProjectContext): Promise<readonly Diagnostic[]> {
    return ir.agents.flatMap((agent) =>
      capabilityDiagnostics(
        agent.id,
        analyzeCapabilities(agent, CLAUDE_CAPABILITIES, context).findings,
        context,
      ),
    );
  }

  async compile(ir: ForjaIr, context: ProjectContext): Promise<readonly GeneratedArtifact[]> {
    const artifacts: GeneratedArtifact[] = [];
    const skillsDir = this.filesystem.resolve(context.projectDir, ".claude", "skills");

    for (const skill of ir.skills) {
      artifacts.push(...(await skillArtifacts(this.filesystem, skillsDir, skill)));
    }

    for (const agent of ir.agents) {
      const { resolved } = analyzeCapabilities(agent, CLAUDE_CAPABILITIES, context);
      artifacts.push({
        path: this.filesystem.resolve(
          context.projectDir,
          ".claude",
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
      const claudeMd = this.filesystem.resolve(context.projectDir, "CLAUDE.md");
      const existing = (await this.filesystem.exists(claudeMd))
        ? await this.filesystem.readFile(claudeMd)
        : null;
      artifacts.push({
        path: claudeMd,
        kind: "instructions",
        contents: composeManagedFile(existing, block),
        merge: true,
      });
    }

    return artifacts;
  }

  async inspect(context: ProjectContext): Promise<HarnessState> {
    const configured = await this.filesystem.exists(
      this.filesystem.resolve(context.projectDir, ".claude"),
    );
    return {
      id: this.id,
      configured,
      summary: configured
        ? "Claude Code project configuration present"
        : "Claude Code is not configured in this project",
    };
  }
}
