import type { Part } from "@opencode-ai/sdk";

export function extractText(parts: readonly Part[]): string {
  return parts
    .filter(
      (part): part is Extract<Part, { type: "text" }> => part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}
