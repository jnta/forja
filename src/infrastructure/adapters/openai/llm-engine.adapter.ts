import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { LLMEnginePort, LLMMessage } from "@/domain/ports";

export interface OpenAILlmEngineOptions {
  apiKey?: string;
  model?: string;
}

function toLangChainMessage(message: LLMMessage) {
  switch (message.role) {
    case "system":
      return new SystemMessage(message.content);
    case "user":
      return new HumanMessage(message.content);
    case "assistant":
      return new AIMessage(message.content);
  }
}

export class OpenAILlmEngine implements LLMEnginePort {
  private readonly model: ChatOpenAI;

  constructor(options: OpenAILlmEngineOptions = {}) {
    this.model = new ChatOpenAI({
      apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
      model: options.model ?? "gpt-4o-mini",
    });
  }

  async generate(messages: readonly LLMMessage[]): Promise<string> {
    const response = await this.model.invoke(messages.map(toLangChainMessage));

    return typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  }
}
