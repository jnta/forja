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
