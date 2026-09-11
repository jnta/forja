import type { OpencodeClient } from "@opencode-ai/sdk";

import type {
  CodingHarnessPort,
  CodingResult,
  CodingTask,
} from "@/domain/ports";

import { ENGINEER_AGENT, ENGINEER_TOOLS } from "./agents";
import { describeAssistantError } from "./errors";
import { parseModelId, type OpenCodeModel } from "./model";
import { extractText } from "./text";

export interface OpenCodeCodingHarnessOptions {
  client: OpencodeClient;
  workspace?: string;
  model?: string;
}

export class OpenCodeCodingHarness implements CodingHarnessPort {
  private readonly client: OpencodeClient;
  private readonly workspace?: string;
  private readonly model?: OpenCodeModel;

  constructor(options: OpenCodeCodingHarnessOptions) {
    this.client = options.client;
    this.workspace = options.workspace ?? process.env.OPENCODE_WORKSPACE;
    this.model = parseModelId(
      options.model ?? process.env.OPENCODE_ENGINEER_MODEL,
    );
  }

  async execute(task: CodingTask): Promise<CodingResult> {
    const query = this.workspace ? { directory: this.workspace } : undefined;

    const { data: session, error: createError } =
      await this.client.session.create({ query });

    if (createError || !session) {
      throw new Error(
        `OpenCode: failed to create session: ${JSON.stringify(createError)}`,
      );
    }

    const { data, error } = await this.client.session.prompt({
      path: { id: session.id },
      query,
      body: {
        agent: ENGINEER_AGENT,
        model: this.model,
        tools: ENGINEER_TOOLS,
        system: task.instructions,
        parts: [
          {
            type: "text",
            text: `Task:\n${task.task}\n\nWork so far:\n${task.context}`,
          },
        ],
      },
    });

    if (error || !data) {
      throw new Error(
        `OpenCode: ${task.role} prompt failed: ${JSON.stringify(error)}`,
      );
    }

    const assistantError = describeAssistantError(data.info.error);
    if (assistantError) {
      throw new Error(
        `OpenCode: ${task.role} prompt failed: ${assistantError}`,
      );
    }

    return { output: extractText(data.parts), sessionId: session.id };
  }
}
