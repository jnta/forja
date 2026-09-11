// @vitest-environment node
import type { OpencodeClient } from "@opencode-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import { ENGINEER_AGENT, ENGINEER_TOOLS } from "./agents";
import { OpenCodeCodingHarness } from "./coding-harness.adapter";

function createFakeClient(promptResult: unknown) {
  const create = vi.fn().mockResolvedValue({ data: { id: "session-9" } });
  const prompt = vi.fn().mockResolvedValue(promptResult);

  const client = {
    session: { create, prompt, delete: vi.fn() },
  } as unknown as OpencodeClient;

  return { client, create, prompt };
}

describe("OpenCodeCodingHarness", () => {
  it("runs an engineer session with tools enabled in the workspace", async () => {
    const { client, create, prompt } = createFakeClient({
      data: {
        info: {},
        parts: [
          { type: "reasoning", text: "thinking" },
          { type: "text", text: "Implemented the endpoint" },
        ],
      },
    });
    const harness = new OpenCodeCodingHarness({
      client,
      workspace: "/work/target",
      model: "opencode/gpt-5-codex",
    });

    const result = await harness.execute({
      role: "backend",
      instructions: "be a backend engineer",
      task: "add a todos endpoint",
      context: "(no work yet)",
    });

    expect(result).toEqual({
      output: "Implemented the endpoint",
      sessionId: "session-9",
    });
    expect(create).toHaveBeenCalledWith({
      query: { directory: "/work/target" },
    });

    const options = prompt.mock.calls[0]?.[0] as {
      body: Record<string, unknown>;
      query: unknown;
    };
    expect(options.query).toEqual({ directory: "/work/target" });
    expect(options.body.agent).toBe(ENGINEER_AGENT);
    expect(options.body.tools).toEqual(ENGINEER_TOOLS);
    expect(options.body.model).toEqual({
      providerID: "opencode",
      modelID: "gpt-5-codex",
    });
    expect(options.body.system).toBe("be a backend engineer");
    expect(options.body.parts).toEqual([
      {
        type: "text",
        text: "Task:\nadd a todos endpoint\n\nWork so far:\n(no work yet)",
      },
    ]);
  });

  it("omits the directory when no workspace is configured", async () => {
    const { client, create } = createFakeClient({
      data: { info: {}, parts: [{ type: "text", text: "done" }] },
    });
    const harness = new OpenCodeCodingHarness({ client });

    await harness.execute({
      role: "qa",
      instructions: "review",
      task: "check it",
      context: "none",
    });

    expect(create).toHaveBeenCalledWith({ query: undefined });
  });

  it("throws when the assistant message reports an error", async () => {
    const { client } = createFakeClient({
      data: {
        info: {
          error: {
            name: "ProviderAuthError",
            data: { providerID: "opencode", message: "missing key" },
          },
        },
        parts: [],
      },
    });
    const harness = new OpenCodeCodingHarness({ client });

    await expect(
      harness.execute({
        role: "qa",
        instructions: "review",
        task: "check it",
        context: "none",
      }),
    ).rejects.toThrow(/qa prompt failed: ProviderAuthError: missing key/);
  });
});
