import type { OpencodeClient } from "@opencode-ai/sdk";

import type { LLMEnginePort, LLMMessage } from "@/domain/ports";

import { ORCHESTRATOR_AGENT, ORCHESTRATOR_TOOLS } from "./agents";
import { describeAssistantError } from "./errors";
import { parseModelId, type OpenCodeModel } from "./model";
import { extractText } from "./text";

export interface OpenCodeLlmEngineOptions {
  client: OpencodeClient;
  model?: string;
}

export class OpenCodeLlmEngine implements LLMEnginePort {
  private readonly client: OpencodeClient;
  private readonly model?: OpenCodeModel;

  constructor(options: OpenCodeLlmEngineOptions) {
    this.client = options.client;
    this.model = parseModelId(
      options.model ?? process.env.OPENCODE_ORCHESTRATOR_MODEL,
    );
  }

  async generate(messages: readonly LLMMessage[]): Promise<string> {
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");

    const conversation = messages
      .filter((message) => message.role !== "system")
      .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
      .join("\n\n");

    const { data: session, error: createError } =
      await this.client.session.create();

    if (createError || !session) {
      throw new Error(
        `OpenCode: failed to create session: ${JSON.stringify(createError)}`,
      );
    }

    try {
      const { data, error } = await this.client.session.prompt({
        path: { id: session.id },
        body: {
          agent: ORCHESTRATOR_AGENT,
          model: this.model,
          tools: ORCHESTRATOR_TOOLS,
          system: system || undefined,
          parts: [{ type: "text", text: conversation }],
        },
      });

      if (error || !data) {
        throw new Error(
          `OpenCode: orchestrator prompt failed: ${JSON.stringify(error)}`,
        );
      }

      const assistantError = describeAssistantError(data.info.error);
      if (assistantError) {
        throw new Error(
          `OpenCode: orchestrator prompt failed: ${assistantError}`,
        );
      }

      return extractText(data.parts);
    } finally {
      await this.client.session
        .delete({ path: { id: session.id } })
        .catch(() => undefined);
    }
  }
}
