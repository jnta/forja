import type { CodingHarnessPort } from "@/domain/ports";
import type { ProjectState, SpecialistRole } from "@/domain/state";

export type AgentNode = (state: ProjectState) => Promise<Partial<ProjectState>>;

export function transcript(state: ProjectState): string {
  if (state.messages.length === 0) {
    return "(no work yet)";
  }

  return state.messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");
}

export function createSpecialistAgent(options: {
  harness: CodingHarnessPort;
  role: SpecialistRole;
  systemPrompt: string;
}): AgentNode {
  const { harness, role, systemPrompt } = options;

  return async (state) => {
    const result = await harness.execute({
      role,
      instructions: systemPrompt,
      task: state.task,
      context: transcript(state),
    });

    return { messages: [{ role, content: result.output }] };
  };
}
