import type { HarnessCapabilities } from "@/domain/capabilities";
import type { AgentDefinition, ShellAccess } from "@/domain/ir";

export const CLAUDE_CAPABILITIES: HarnessCapabilities = {
  id: "claude-code",
  readFiles: true,
  writeFiles: true,
  network: true,
  shellNone: true,
  shellFull: true,
  shellReadonly: false,
  agents: true,
};

/** Claude Code tool allowlist derived from resolved capabilities. */
export function buildTools(agent: AgentDefinition, shell: ShellAccess): string[] {
  const tools: string[] = [];
  if (agent.capabilities.readFiles) tools.push("Read", "Grep", "Glob");
  if (agent.capabilities.writeFiles) tools.push("Edit", "Write");
  if (shell === "full") tools.push("Bash");
  if (agent.capabilities.network) tools.push("WebFetch", "WebSearch");
  if (agent.skills.length > 0) tools.push("Skill");
  return tools;
}
