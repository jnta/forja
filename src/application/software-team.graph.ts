import { Annotation, StateGraph, START, END } from "@langchain/langgraph";

import type { LLMEnginePort, LLMMessage } from "@/domain/ports";
import type { ProjectState } from "@/domain/state";

export const TeamState = Annotation.Root({
  task: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
  messages: Annotation<string[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
});

export type TeamStateShape = typeof TeamState.State;

export interface SoftwareTeamDependencies {
  llm: LLMEnginePort;
}

const DEVELOPER_SYSTEM_PROMPT =
  "You are a software developer on a small engineering team. Complete the task concisely.";

export function createSoftwareTeamGraph({ llm }: SoftwareTeamDependencies) {
  const developer = async (
    state: ProjectState,
  ): Promise<Partial<ProjectState>> => {
    const prompt: LLMMessage[] = [
      { role: "system", content: DEVELOPER_SYSTEM_PROMPT },
      { role: "user", content: state.task },
    ];

    const reply = await llm.generate(prompt);

    return { messages: [reply] };
  };

  return new StateGraph(TeamState)
    .addNode("developer", developer)
    .addEdge(START, "developer")
    .addEdge("developer", END)
    .compile();
}
