/**
 * Declarative tool, MCP and credential vocabulary (PRD 66–70).
 *
 * Declarations are harness-agnostic. Credentials are *references* only: Forja
 * never stores or copies a secret value into generated files, state or logs.
 */
export interface CredentialReference {
  readonly name: string;
  /** Where the value is resolved from at runtime. */
  readonly from: "env" | "file" | "keychain";
  /** Environment variable, path or keychain entry name. */
  readonly key: string;
}

export type McpTransport = "stdio" | "http" | "sse";

export interface McpServerDeclaration {
  readonly id: string;
  readonly transport: McpTransport;
  /** For `stdio` transports. */
  readonly command?: string;
  readonly args?: readonly string[];
  /** For `http`/`sse` transports. */
  readonly url?: string;
  readonly credentials?: readonly CredentialReference[];
}

export interface ToolDeclaration {
  readonly name: string;
  readonly description?: string;
  readonly source: "builtin" | "mcp";
  /** MCP server id, when `source` is `mcp`. */
  readonly server?: string;
}
