import type { AssistantMessage } from "@opencode-ai/sdk";

export function describeAssistantError(
  error: AssistantMessage["error"],
): string | undefined {
  if (!error) {
    return undefined;
  }

  const data = error.data;
  if (data && "message" in data && typeof data.message === "string") {
    return `${error.name}: ${data.message}`;
  }

  return error.name;
}
