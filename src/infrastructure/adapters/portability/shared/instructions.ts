import type { PolicyDefinition, VerificationDefinition, WorkflowDefinition } from "@/domain/ir";
import type { McpServerDeclaration, ToolDeclaration } from "@/domain/tools";

export const MANAGED_BEGIN = "<!-- forja:begin -->";
export const MANAGED_END = "<!-- forja:end -->";

export interface InstructionInput {
  readonly workflows: readonly WorkflowDefinition[];
  readonly policies: readonly PolicyDefinition[];
  readonly verification: VerificationDefinition;
  readonly tools?: readonly ToolDeclaration[];
  readonly mcpServers?: readonly McpServerDeclaration[];
}

function renderDeclarations(input: InstructionInput): string[] {
  const sections: string[] = [];

  const tools = [...(input.tools ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  if (tools.length > 0) {
    const lines = ["## Tools", ""];
    for (const tool of tools) {
      const origin = tool.source === "mcp" ? ` (mcp: ${tool.server})` : "";
      lines.push(`- ${tool.name}${origin}`);
    }
    sections.push(lines.join("\n"));
  }

  const servers = [...(input.mcpServers ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  if (servers.length > 0) {
    const lines = ["## MCP servers", ""];
    for (const server of servers) {
      const target = server.command
        ? `${server.command}${server.args ? ` ${server.args.join(" ")}` : ""}`
        : (server.url ?? "");
      lines.push(`- ${server.id} (${server.transport})${target ? `: ${target}` : ""}`);
      for (const credential of server.credentials ?? []) {
        // References only: the secret value is never written.
        lines.push(`  - credential ${credential.name} from ${credential.from} ${credential.key}`);
      }
    }
    lines.push("");
    lines.push(
      "Configure these servers natively in your harness; Forja does not write secret values.",
    );
    sections.push(lines.join("\n"));
  }

  return sections;
}

/**
 * Render the Forja-managed block for `AGENTS.md` / `CLAUDE.md` (PRD 45).
 * Everything outside the markers is user-authored and preserved.
 */
export function renderInstructionsBlock(input: InstructionInput): string {
  const sections: string[] = [];

  const workflows = [...input.workflows].sort((a, b) => a.id.localeCompare(b.id));
  if (workflows.length > 0) {
    const lines = ["## Workflow", ""];
    for (const workflow of workflows) {
      lines.push(`### ${workflow.id}`, "");
      workflow.steps.forEach((step, index) => {
        const suffix = step.description ? ` — ${step.description}` : "";
        lines.push(`${index + 1}. ${step.id}${suffix}`);
      });
      lines.push("");
    }
    sections.push(lines.join("\n").trimEnd());
  }

  const rules = [...new Set(input.policies.flatMap((policy) => policy.rules))].sort();
  if (rules.length > 0) {
    sections.push(["## Rules", "", ...rules.map((rule) => `- ${rule}`)].join("\n"));
  }

  const { fast, full } = input.verification;
  if (fast.length > 0 || full.length > 0) {
    const lines = ["## Verification", ""];
    if (fast.length > 0) lines.push("Fast:", "", `    ${fast}`, "");
    if (full.length > 0) lines.push("Full:", "", `    ${full}`, "");
    lines.push("A task is not complete until full verification succeeds.");
    sections.push(lines.join("\n"));
  }

  sections.push(...renderDeclarations(input));

  if (sections.length === 0) return "";

  return [
    MANAGED_BEGIN,
    "# Forja agent instructions",
    "",
    sections.join("\n\n"),
    MANAGED_END,
  ].join("\n");
}

/** Merge the managed block into an existing file, preserving manual content. */
export function composeManagedFile(existing: string | null, block: string): string {
  if (block.length === 0) return existing ?? "";

  if (existing === null || existing.trim().length === 0) {
    return `${block}\n`;
  }

  const begin = existing.indexOf(MANAGED_BEGIN);
  const end = existing.indexOf(MANAGED_END);
  if (begin !== -1 && end !== -1 && end > begin) {
    const before = existing.slice(0, begin);
    const after = existing.slice(end + MANAGED_END.length);
    return `${before}${block}${after}`;
  }

  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${separator}${block}\n`;
}
