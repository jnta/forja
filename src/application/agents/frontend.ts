import type { CodingHarnessPort } from "@/domain/ports";

import { createSpecialistAgent } from "./agent";

const FRONTEND_SYSTEM_PROMPT = `You are the frontend engineer on a small software team.
Using the task and the team's work so far, produce the frontend design and implementation notes.
Cover the screens, components, state management and how the UI consumes the backend API. Be concrete and concise.`;

export function createFrontendAgent(harness: CodingHarnessPort) {
  return createSpecialistAgent({
    harness,
    role: "frontend",
    systemPrompt: FRONTEND_SYSTEM_PROMPT,
  });
}
