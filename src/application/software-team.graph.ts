import { Annotation, StateGraph, START, END } from "@langchain/langgraph";

import type { CodingHarnessPort, LLMEnginePort } from "@/domain/ports";
import type { AgentMessage, AgentRoute } from "@/domain/state";

import { createBackendAgent } from "./agents/backend";
import { createFrontendAgent } from "./agents/frontend";
import { createOrchestratorAgent } from "./agents/orchestrator";
import { createQaAgent } from "./agents/qa";

export const MAX_ITERATIONS = 8;

const taskChannel = Annotation<string>({
  reducer: (_current, update) => update,
  default: () => "",
});

export const TeamState = Annotation.Root({
  task: taskChannel,
  messages: Annotation<AgentMessage[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  next: Annotation<AgentRoute>({
    reducer: (_current, update) => update,
    default: () => "backend",
  }),
  iterations: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),
});

const TeamInput = Annotation.Root({
  task: taskChannel,
});

export type TeamStateShape = typeof TeamState.State;

export interface SoftwareTeamDependencies {
  llm: LLMEnginePort;
  harness: CodingHarnessPort;
}

export function createSoftwareTeamGraph({
  llm,
  harness,
}: SoftwareTeamDependencies) {
  const routeAfterOrchestrator = (
    state: TeamStateShape,
  ): Exclude<AgentRoute, "done"> | typeof END => {
    if (state.next === "done" || state.iterations >= MAX_ITERATIONS) {
      return END;
    }

    return state.next;
  };

  return new StateGraph({ state: TeamState, input: TeamInput })
    .addNode("orchestrator", createOrchestratorAgent(llm))
    .addNode("backend", createBackendAgent(harness))
    .addNode("frontend", createFrontendAgent(harness))
    .addNode("qa", createQaAgent(harness))
    .addEdge(START, "orchestrator")
    .addConditionalEdges("orchestrator", routeAfterOrchestrator, [
      "backend",
      "frontend",
      "qa",
      END,
    ])
    .addEdge("backend", "orchestrator")
    .addEdge("frontend", "orchestrator")
    .addEdge("qa", "orchestrator")
    .compile();
}
