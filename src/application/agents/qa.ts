import type { CodingHarnessPort } from "@/domain/ports";

import { createSpecialistAgent } from "./agent";

const QA_SYSTEM_PROMPT = `You are the QA engineer on a small software team.
Review the work produced so far against the task. List concrete issues, missing cases and risks.
If the result is acceptable, state that explicitly so the team can finish.`;

export function createQaAgent(harness: CodingHarnessPort) {
  return createSpecialistAgent({
    harness,
    role: "qa",
    systemPrompt: QA_SYSTEM_PROMPT,
  });
}
