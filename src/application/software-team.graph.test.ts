import { describe, expect, it } from "vitest";

import type {
  CodingHarnessPort,
  CodingTask,
  LLMEnginePort,
  LLMMessage,
} from "@/domain/ports";

import { createSoftwareTeamGraph, MAX_ITERATIONS } from "./software-team.graph";

function createScriptedLlm(decisions: readonly string[]) {
  const calls: LLMMessage[][] = [];
  let orchestratorCalls = 0;

  const llm: LLMEnginePort = {
    async generate(messages) {
      calls.push([...messages]);

      const system = messages[0]?.content ?? "";
      if (system.toLowerCase().includes("orchestrator")) {
        return decisions[Math.min(orchestratorCalls++, decisions.length - 1)];
      }

      return "unexpected llm call";
    },
  };

  return { llm, calls };
}

function createRecordingHarness() {
  const tasks: CodingTask[] = [];

  const harness: CodingHarnessPort = {
    async execute(task) {
      tasks.push(task);
      return { output: `${task.role} output` };
    },
  };

  return { harness, tasks };
}

describe("createSoftwareTeamGraph", () => {
  it("routes through the requested agents and finishes when the orchestrator is done", async () => {
    const { llm } = createScriptedLlm(["backend", "frontend", "qa", "done"]);
    const { harness } = createRecordingHarness();
    const graph = createSoftwareTeamGraph({ llm, harness });

    const result = await graph.invoke({ task: "Build a todo app" });

    expect(result.messages.map((message) => message.role)).toEqual([
      "orchestrator",
      "backend",
      "orchestrator",
      "frontend",
      "orchestrator",
      "qa",
      "orchestrator",
    ]);
    expect(result.next).toBe("done");
    expect(result.iterations).toBe(4);
  });

  it("stops after MAX_ITERATIONS when the orchestrator never finishes", async () => {
    const { llm } = createScriptedLlm(["backend"]);
    const { harness } = createRecordingHarness();
    const graph = createSoftwareTeamGraph({ llm, harness });

    const result = await graph.invoke({ task: "Loop forever" });

    expect(result.iterations).toBe(MAX_ITERATIONS);
    expect(
      result.messages.filter((message) => message.role === "orchestrator"),
    ).toHaveLength(MAX_ITERATIONS);
    expect(result.messages.at(-1)?.role).toBe("orchestrator");
  });

  it("falls back to done when the orchestrator reply is unrecognised", async () => {
    const { llm } = createScriptedLlm(["no idea"]);
    const { harness } = createRecordingHarness();
    const graph = createSoftwareTeamGraph({ llm, harness });

    const result = await graph.invoke({ task: "Ambiguous request" });

    expect(result.messages.map((message) => message.role)).toEqual([
      "orchestrator",
    ]);
    expect(result.next).toBe("done");
  });

  it("hands the task and the work so far to the specialist harness", async () => {
    const { llm } = createScriptedLlm(["backend", "done"]);
    const { harness, tasks } = createRecordingHarness();
    const graph = createSoftwareTeamGraph({ llm, harness });

    await graph.invoke({ task: "Build a todo app" });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.role).toBe("backend");
    expect(tasks[0]?.task).toBe("Build a todo app");
    expect(tasks[0]?.instructions).toContain("backend engineer");
    expect(tasks[0]?.context).toContain("Next up: backend.");
  });
});
