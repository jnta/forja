/**
 * Serialization boundary.
 *
 * YAML parsing lives in infrastructure (the `yaml` package) and is exposed to
 * the application layer through this port, keeping the domain free of
 * third-party parsers.
 */
export class YamlParseError extends Error {
  readonly line?: number;
  readonly column?: number;

  constructor(
    message: string,
    options: { readonly line?: number; readonly column?: number; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "YamlParseError";
    this.line = options.line;
    this.column = options.column;
  }
}

export interface YamlParserPort {
  /** Parse a YAML document into a plain value. Throws `YamlParseError`. */
  parse(source: string, options?: { readonly sourceName?: string }): unknown;
}

export interface YamlSerializerPort {
  /** Serialize a plain value to YAML text. */
  stringify(value: unknown): string;
}

export interface HarnessToggle {
  readonly id: string;
  readonly enabled: boolean;
}

export interface YamlDocumentPort {
  /**
   * Set the `harnesses` mapping in a `forja.yaml` document, preserving other
   * keys. `source` may be empty when the file does not exist yet.
   */
  updateHarnesses(source: string, harnesses: readonly HarnessToggle[]): string;
  /**
   * Set or delete a top-level configuration key, preserving other keys.
   * An empty value array deletes the key.
   */
  setConfigValue(source: string, key: string, value: unknown): string;
}
