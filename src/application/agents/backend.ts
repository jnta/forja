import type { CodingHarnessPort } from "@/domain/ports";

import { createSpecialistAgent } from "./agent";

const BACKEND_SYSTEM_PROMPT = `You are the backend engineer on a small software team.
Using the task and the team's work so far, produce the backend design and implementation notes.
Cover the API surface, data model, business logic and persistence. Be concrete and concise.`;

export function createBackendAgent(harness: CodingHarnessPort) {
  return createSpecialistAgent({
    harness,
    role: "backend",
    systemPrompt: BACKEND_SYSTEM_PROMPT,
  });
}
