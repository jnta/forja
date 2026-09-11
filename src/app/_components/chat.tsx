"use client";

import { useState } from "react";

import type { AgentMessage } from "@/domain/state";

export function Chat() {
  const [task, setTask] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const data = (await response.json()) as { messages: AgentMessage[] };
      setMessages(data.messages);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex w-full gap-3">
        <input
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="Describe a task for the team..."
          className="flex-1 rounded-full border border-black/[.08] px-5 py-3 text-base dark:border-white/[.145]"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-12 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          {loading ? "Working..." : "Run"}
        </button>
      </form>

      <ul className="flex flex-col gap-3">
        {messages.map((message, index) => (
          <li
            key={index}
            className="flex flex-col gap-1 rounded-lg border border-black/[.08] px-5 py-3 text-base dark:border-white/[.145]"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {message.role}
            </span>
            <p className="whitespace-pre-wrap">{message.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
