import type { HarnessCapabilities } from "@/domain/capabilities";
import type { AgentDefinition, ShellAccess } from "@/domain/ir";

export const OPENCODE_CAPABILITIES: HarnessCapabilities = {
  id: "opencode",
  readFiles: true,
  writeFiles: true,
  network: true,
  shellNone: true,
  shellFull: true,
  shellReadonly: false,
  agents: true,
};

/** Translate resolved capabilities into OpenCode permissions (PRD 34, 69). */
export function buildPermissions(
  agent: AgentDefinition,
  shell: ShellAccess,
): Record<string, unknown> {
  const permissions: Record<string, unknown> = {
    read: agent.capabilities.readFiles ? "allow" : "deny",
    edit: agent.capabilities.writeFiles ? "allow" : "deny",
    bash: shell === "full" ? "allow" : "deny",
    webfetch: agent.capabilities.network ? "allow" : "deny",
    websearch: agent.capabilities.network ? "allow" : "deny",
  };

  if (agent.skills.length > 0) {
    const skill: Record<string, unknown> = { "*": "deny" };
    for (const id of [...agent.skills].sort()) skill[id] = "allow";
    permissions.skill = skill;
  }

  return permissions;
}
