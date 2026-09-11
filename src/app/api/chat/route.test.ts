// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/container", () => ({
  softwareTeamWorkflow: { invoke },
}));

import { POST } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  invoke.mockReset();
});

describe("POST /api/chat", () => {
  it("runs the workflow with the task and returns its messages", async () => {
    const messages = [{ role: "backend", content: "Implemented the API" }];
    invoke.mockResolvedValue({ messages });

    const response = await POST(postRequest({ task: "Build a todo app" }));

    expect(invoke).toHaveBeenCalledWith({ task: "Build a todo app" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ messages });
  });

  it("rejects an invalid payload without running the workflow", async () => {
    await expect(POST(postRequest({}))).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
});
