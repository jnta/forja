import { stringify } from "yaml";

import type { AgentDefinition, ShellAccess } from "@/domain/ir";

import { buildPermissions } from "./permissions";

/** Render an OpenCode Markdown agent (`.opencode/agents/<id>.md`). */
export function renderAgent(agent: AgentDefinition, shell: ShellAccess): string {
  const frontmatter: Record<string, unknown> = {
    description: agent.description,
    mode: agent.type,
    permission: buildPermissions(agent, shell),
  };

  const extension = agent.extensions?.opencode;
  if (extension) Object.assign(frontmatter, extension);

  const yaml = stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${agent.instructions.trim()}\n`;
}
