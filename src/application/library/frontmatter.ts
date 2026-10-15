/** Split optional YAML frontmatter from a Markdown document. */
export interface Frontmatter {
  /** Raw YAML between the delimiters, or `null` when there is no frontmatter. */
  readonly yaml: string | null;
  readonly body: string;
}

export type FrontmatterResult =
  | { readonly ok: true; readonly value: Frontmatter }
  | { readonly ok: false; readonly message: string };

export function splitFrontmatter(source: string): FrontmatterResult {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---")) {
    return { ok: true, value: { yaml: null, body: normalized } };
  }
  if (!normalized.startsWith("---\n")) {
    return {
      ok: false,
      message: "frontmatter must open with '---' on its own line",
    };
  }

  const closing = normalized.indexOf("\n---", 3);
  if (closing === -1) {
    return {
      ok: false,
      message: "unterminated frontmatter: missing closing '---'",
    };
  }

  const yaml = normalized.slice(4, closing);
  const body = normalized.slice(closing + 4).replace(/^\n/, "");
  return { ok: true, value: { yaml, body } };
}
