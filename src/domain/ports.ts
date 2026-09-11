import type { SpecialistRole } from "./state";

export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMEnginePort {
  generate(messages: readonly LLMMessage[]): Promise<string>;
}

export interface CodingTask {
  role: SpecialistRole;
  instructions: string;
  task: string;
  context: string;
}

export interface CodingResult {
  output: string;
  sessionId?: string;
}

export interface CodingHarnessPort {
  execute(task: CodingTask): Promise<CodingResult>;
}
