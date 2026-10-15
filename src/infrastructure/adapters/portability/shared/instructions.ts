import type { PolicyDefinition, VerificationDefinition, WorkflowDefinition } from "@/domain/ir";

export const MANAGED_BEGIN = "<!-- forja:begin -->";
export const MANAGED_END = "<!-- forja:end -->";

export interface InstructionInput {
  readonly workflows: readonly WorkflowDefinition[];
  readonly policies: readonly PolicyDefinition[];
  readonly verification: VerificationDefinition;
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
