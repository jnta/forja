// @vitest-environment node
import type { OpencodeClient } from "@opencode-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import { ORCHESTRATOR_AGENT, ORCHESTRATOR_TOOLS } from "./agents";
import { OpenCodeLlmEngine } from "./llm-engine.adapter";

function createFakeClient(promptResult: unknown) {
  const create = vi.fn().mockResolvedValue({ data: { id: "session-1" } });
  const prompt = vi.fn().mockResolvedValue(promptResult);
  const remove = vi.fn().mockResolvedValue({ data: true });

  const client = {
    session: { create, prompt, delete: remove },
  } as unknown as OpencodeClient;

  return { client, create, prompt, remove };
}

describe("OpenCodeLlmEngine", () => {
  it("runs a tool-less orchestrator session and returns the response text", async () => {
    const { client, prompt, remove } = createFakeClient({
      data: { info: {}, parts: [{ type: "text", text: "next: backend" }] },
    });
    const engine = new OpenCodeLlmEngine({
      client,
      model: "opencode/gpt-5-nano",
    });

    const result = await engine.generate([
      { role: "system", content: "route the team" },
      { role: "user", content: "build a todo app" },
    ]);

    expect(result).toBe("next: backend");

    const options = prompt.mock.calls[0]?.[0] as {
      body: Record<string, unknown>;
    };
    expect(options.body.agent).toBe(ORCHESTRATOR_AGENT);
    expect(options.body.tools).toEqual(ORCHESTRATOR_TOOLS);
    expect(options.body.model).toEqual({
      providerID: "opencode",
      modelID: "gpt-5-nano",
    });
    expect(options.body.system).toBe("route the team");
    expect(options.body.parts).toEqual([
      { type: "text", text: "USER:\nbuild a todo app" },
    ]);
    expect(remove).toHaveBeenCalledWith({ path: { id: "session-1" } });
  });

  it("deletes the session and throws when the prompt fails", async () => {
    const { client, remove } = createFakeClient({
      data: undefined,
      error: { message: "boom" },
    });
    const engine = new OpenCodeLlmEngine({ client });

    await expect(
      engine.generate([{ role: "user", content: "hi" }]),
    ).rejects.toThrow(/orchestrator prompt failed/);
    expect(remove).toHaveBeenCalledWith({ path: { id: "session-1" } });
  });

  it("throws when the assistant message reports an error", async () => {
    const { client, remove } = createFakeClient({
      data: {
        info: {
          error: {
            name: "APIError",
            data: { message: "Insufficient balance", isRetryable: false },
          },
        },
        parts: [],
      },
    });
    const engine = new OpenCodeLlmEngine({ client });

    await expect(
      engine.generate([{ role: "user", content: "hi" }]),
    ).rejects.toThrow(/Insufficient balance/);
    expect(remove).toHaveBeenCalledWith({ path: { id: "session-1" } });
  });
});
