import { createSoftwareTeamGraph } from "@/application/software-team.graph";
import { createOpenCodeClient } from "@/infrastructure/adapters/opencode/client";
import { OpenCodeCodingHarness } from "@/infrastructure/adapters/opencode/coding-harness.adapter";
import { OpenCodeLlmEngine } from "@/infrastructure/adapters/opencode/llm-engine.adapter";

const openCodeClient = createOpenCodeClient();

const orchestratorEngine = new OpenCodeLlmEngine({ client: openCodeClient });
const engineerHarness = new OpenCodeCodingHarness({ client: openCodeClient });

export const softwareTeamWorkflow = createSoftwareTeamGraph({
  llm: orchestratorEngine,
  harness: engineerHarness,
});

export { openCodeClient };
