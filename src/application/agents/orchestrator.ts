import type { LLMEnginePort, LLMMessage } from "@/domain/ports";
import type { AgentRoute, ProjectState } from "@/domain/state";

import { transcript } from "./agent";

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the orchestrator of a small software team made of a backend engineer, a frontend engineer and a QA engineer.
Given the task and the work done so far, decide who should act next.
Reply with exactly one word: "backend", "frontend", "qa" or "done".
Pick "done" only when the task is fully addressed and QA has approved the result.`;

export function createOrchestratorAgent(llm: LLMEnginePort) {
  return async (state: ProjectState): Promise<Partial<ProjectState>> => {
    const prompt: LLMMessage[] = [
      { role: "system", content: ORCHESTRATOR_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Task:\n${state.task}\n\nWork so far:\n${transcript(
          state,
        )}\n\nWho should act next?`,
      },
    ];

    const next = parseRoute(await llm.generate(prompt));

    return {
      next,
      iterations: 1,
      messages: [{ role: "orchestrator", content: `Next up: ${next}.` }],
    };
  };
}

function parseRoute(reply: string): AgentRoute {
  const normalized = reply.toLowerCase();

  if (normalized.includes("backend")) {
    return "backend";
  }
  if (normalized.includes("frontend")) {
    return "frontend";
  }
  if (normalized.includes("qa")) {
    return "qa";
  }

  return "done";
}
