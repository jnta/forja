// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Chat } from "./chat";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Chat", () => {
  it("submits the task and renders the returned role-tagged messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        messages: [{ role: "backend", content: "Implemented the API" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Chat />);

    fireEvent.change(
      screen.getByPlaceholderText("Describe a task for the team..."),
      { target: { value: "Build a todo app" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(await screen.findByText("Implemented the API")).toBeDefined();
    expect(screen.getByText("backend")).toBeDefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ task: "Build a todo app" });
  });
});
