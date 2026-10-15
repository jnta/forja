import type { AgentDefinition, ShellAccess } from "@/domain/ir";

function tomlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Render a Codex custom agent (`.codex/agents/<id>.toml`). Unsupported
 * capabilities are recorded as explicit limitations in the instructions when an
 * instruction-only fallback was allowed.
 */
export function renderAgent(
  agent: AgentDefinition,
  shell: ShellAccess,
  limitations: readonly string[],
): string {
  const lines = [
    `name = ${tomlString(agent.id)}`,
    `description = ${tomlString(agent.description)}`,
  ];

  if (shell !== "full") lines.push("features.shell_tool = false");

  let instructions = agent.instructions.trim();
  if (limitations.length > 0) {
    instructions += `\n\nForja limitations:\n${limitations.map((item) => `- ${item}`).join("\n")}`;
  }
  lines.push(`developer_instructions = ${tomlString(instructions)}`);

  return `${lines.join("\n")}\n`;
}
