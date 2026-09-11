export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMEnginePort {
  generate(messages: readonly LLMMessage[]): Promise<string>;
}
