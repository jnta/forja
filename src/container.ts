import { createSoftwareTeamGraph } from "@/application/software-team.graph";
import type { LLMEnginePort } from "@/domain/ports";
import { OpenAILlmEngine } from "@/infrastructure/adapters/openai/llm-engine.adapter";

const llmEngine: LLMEnginePort = new OpenAILlmEngine();

export const softwareTeamWorkflow = createSoftwareTeamGraph({ llm: llmEngine });

export { llmEngine };
