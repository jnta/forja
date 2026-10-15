import { stringify } from "yaml";

import type { AgentDefinition, ShellAccess } from "@/domain/ir";

import { buildTools } from "./permissions";

/** Render a Claude Code subagent (`.claude/agents/<id>.md`). */
export function renderAgent(agent: AgentDefinition, shell: ShellAccess): string {
  const frontmatter: Record<string, unknown> = {
    name: agent.id,
    description: agent.description,
    tools: buildTools(agent, shell).join(", "),
  };

  const extension = agent.extensions?.["claude-code"];
  if (extension) Object.assign(frontmatter, extension);

  const yaml = stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${agent.instructions.trim()}\n`;
}
