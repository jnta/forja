import { LOCAL_CONFIG_IGNORE_ENTRY } from "../library/paths";

/** Entries that must be present in `.gitignore` for a project setup. */
export const REQUIRED_GITIGNORE_ENTRIES: readonly string[] = [LOCAL_CONFIG_IGNORE_ENTRY];

function normalizeLines(contents: string): string[] {
  return contents.split(/\r?\n/);
}

/** Returns the required entries that are not already present. */
export function missingGitIgnoreEntries(
  contents: string,
  required: readonly string[] = REQUIRED_GITIGNORE_ENTRIES,
): string[] {
  const lines = new Set(normalizeLines(contents).map((line) => line.trim()));
  return required.filter((entry) => !lines.has(entry));
}

/** Append missing entries, preserving existing content and line endings. */
export function appendGitIgnoreEntries(
  contents: string,
  required: readonly string[] = REQUIRED_GITIGNORE_ENTRIES,
): string {
  const missing = missingGitIgnoreEntries(contents, required);
  if (missing.length === 0) return contents;
  const suffix =
    contents.length === 0 || contents.endsWith("\n") ? "" : "\n";
  return `${contents}${suffix}# Forja local configuration (uncommitted)\n${missing.join("\n")}\n`;
}
