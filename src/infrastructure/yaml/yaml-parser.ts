import { parse, parseDocument, stringify } from "yaml";

import {
  YamlParseError,
  type HarnessToggle,
  type YamlDocumentPort,
  type YamlParserPort,
  type YamlSerializerPort,
} from "@/domain/serialization";

interface LinePos {
  readonly line: number;
  readonly col: number;
}

function firstLinePos(error: unknown): LinePos | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "linePos" in error &&
    Array.isArray((error as { linePos?: unknown }).linePos)
  ) {
    return (error as { linePos: LinePos[] }).linePos[0];
  }
  return undefined;
}

/** `yaml`-backed YAML parser. */
export class YamlParser
  implements YamlParserPort, YamlSerializerPort, YamlDocumentPort
{
  parse(source: string, options: { readonly sourceName?: string } = {}): unknown {
    try {
      return parse(source, { prettyErrors: true, uniqueKeys: true });
    } catch (error) {
      const position = firstLinePos(error);
      const message =
        error instanceof Error ? error.message.split("\n")[0] : "Invalid YAML.";
      const prefix = options.sourceName ? `${options.sourceName}: ` : "";
      throw new YamlParseError(`${prefix}${message}`, {
        line: position?.line,
        column: position?.col,
        cause: error,
      });
    }
  }

  stringify(value: unknown): string {
    return stringify(value, { lineWidth: 0 });
  }

  updateHarnesses(source: string, harnesses: readonly HarnessToggle[]): string {
    const document = parseDocument(source.length > 0 ? source : "version: 1\n");
    const mapping: Record<string, { enabled: boolean }> = {};
    for (const harness of [...harnesses].sort((a, b) => a.id.localeCompare(b.id))) {
      mapping[harness.id] = { enabled: harness.enabled };
    }
    document.set("harnesses", mapping);
    return document.toString();
  }
}
