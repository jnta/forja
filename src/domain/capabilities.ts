/**
 * Capability negotiation (PRD 34–35, 69).
 *
 * Harnesses never have identical capabilities. Forja reports an exact/degraded/
 * unsupported state per requested capability and never silently weakens a
 * security-sensitive permission. Instruction-only fallbacks require explicit
 * configuration.
 */
import type { Diagnostic } from "./diagnostics";
import { CODES, makeDiagnostic } from "./diagnostics";
import type { AgentDefinition, ForjaIr, ShellAccess } from "./ir";

export type CapabilityState = "exact" | "degraded" | "unsupported";

export interface HarnessCapabilities {
  readonly id: string;
  /** Can enforce read on/off. */
  readonly readFiles: boolean;
  /** Can enforce writes off. */
  readonly writeFiles: boolean;
  /** Can enforce no network access. */
  readonly network: boolean;
  readonly shellNone: boolean;
  readonly shellFull: boolean;
  readonly shellReadonly: boolean;
  /** Can define native agents (not just instructions). */
  readonly agents: boolean;
}

export interface CapabilityFinding {
  readonly capability: string;
  readonly state: CapabilityState;
  readonly message: string;
}

export interface ResolvedCapabilities {
  readonly readFiles: boolean;
  readonly writeFiles: boolean;
  readonly shell: ShellAccess;
  readonly network: boolean;
}

export interface CapabilityAnalysis {
  readonly resolved: ResolvedCapabilities;
  readonly findings: readonly CapabilityFinding[];
}

export interface AnalysisOptions {
  readonly strict?: boolean;
  readonly instructionFallback?: boolean;
}

function finding(
  capability: string,
  state: CapabilityState,
  message: string,
): CapabilityFinding {
  return { capability, state, message };
}

/** Compare a requested capability against what a harness can represent. */
export function analyzeCapabilities(
  agent: AgentDefinition,
  harness: HarnessCapabilities,
  options: AnalysisOptions = {},
): CapabilityAnalysis {
  const findings: CapabilityFinding[] = [];
  const { readFiles, writeFiles, shell, network } = agent.capabilities;

  if (!readFiles && !harness.readFiles) {
    findings.push(
      finding("filesystem.read", "unsupported", `${harness.id} cannot disable file reads`),
    );
  }
  if (!writeFiles && !harness.writeFiles) {
    findings.push(
      finding("filesystem.write", "unsupported", `${harness.id} cannot enforce read-only files`),
    );
  }
  if (!network && !harness.network) {
    findings.push(
      finding("network", "unsupported", `${harness.id} cannot enforce offline agents`),
    );
  }

  let resolvedShell = shell;
  if (shell === "none" && !harness.shellNone) {
    findings.push(finding("shell.none", "unsupported", `${harness.id} cannot disable the shell`));
  } else if (shell === "full" && !harness.shellFull) {
    findings.push(finding("shell.full", "unsupported", `${harness.id} cannot grant a full shell`));
  } else if (shell === "readonly" && !harness.shellReadonly) {
    resolvedShell = "none";
    findings.push(
      finding(
        "shell.readonly",
        "degraded",
        `${harness.id} cannot represent a read-only shell; shell access is disabled`,
      ),
    );
  }

  if (agent.skills.length > 0 && !harness.readFiles) {
    findings.push(
      finding("skills", "degraded", `${harness.id} cannot scope skill access per agent`),
    );
  }

  if (!harness.agents) {
    findings.push(
      finding("agent", "unsupported", `${harness.id} has no native agent definitions`),
    );
  }

  void options;
  return {
    resolved: { readFiles, writeFiles, shell: resolvedShell, network },
    findings,
  };
}

/**
 * Declarative tool/MCP declarations compile to instructions; native
 * configuration is left to the user. This is a documented, non-silent fallback.
 */
export function declarationDiagnostics(
  ir: ForjaIr,
  harnessId: string,
  options: AnalysisOptions = {},
): Diagnostic[] {
  const hasDeclarations = ir.tools.length > 0 || ir.mcpServers.length > 0;
  if (!hasDeclarations) return [];
  return [
    makeDiagnostic({
      code: CODES.compatDegraded,
      severity: options.strict ? "error" : "warning",
      message: `${harnessId} documents tool/MCP declarations in instructions; native configuration is manual`,
      resolution:
        "Forja never writes secret values; configure the servers natively as described in the instructions.",
    }),
  ];
}
export function capabilityDiagnostics(
  agentId: string,
  findings: readonly CapabilityFinding[],
  options: AnalysisOptions = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const item of findings) {
    if (item.state === "unsupported" && !options.instructionFallback) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.compatUnsupported,
          message: `agent "${agentId}": ${item.message}`,
          resolution:
            "Enable an explicit instruction-only fallback under compatibility, or use a different harness.",
        }),
      );
    } else if (item.state === "unsupported" || item.state === "degraded") {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.compatDegraded,
          severity: options.strict ? "error" : "warning",
          message: `agent "${agentId}": ${item.message}`,
          resolution: options.strict
            ? "Strict compatibility treats degraded semantics as errors."
            : "Review the generated configuration for this agent.",
        }),
      );
    }
  }
  return diagnostics;
}
