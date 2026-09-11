import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";

const DEFAULT_BASE_URL = "http://127.0.0.1:4096";

type OpenCodeClientConfig = NonNullable<
  Parameters<typeof createOpencodeClient>[0]
>;

export interface OpenCodeClientOptions {
  baseUrl?: string;
  username?: string;
  password?: string;
  directory?: string;
}

export function createOpenCodeClient(
  options: OpenCodeClientOptions = {},
): OpencodeClient {
  const baseUrl =
    options.baseUrl ?? process.env.OPENCODE_SERVER_URL ?? DEFAULT_BASE_URL;
  const username =
    options.username ?? process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
  const password = options.password ?? process.env.OPENCODE_SERVER_PASSWORD;
  const directory = options.directory ?? process.env.OPENCODE_WORKSPACE;

  const config: OpenCodeClientConfig = { baseUrl };

  if (directory) {
    config.directory = directory;
  }

  if (password) {
    const credentials = Buffer.from(`${username}:${password}`).toString(
      "base64",
    );

    config.fetch = (request) => {
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Basic ${credentials}`);
      return globalThis.fetch(new Request(request, { headers }));
    };
  }

  return createOpencodeClient(config);
}
