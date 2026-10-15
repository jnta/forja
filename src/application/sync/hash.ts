import { createHash } from "node:crypto";

/** `sha256-<hex>` digest of generated file content. */
export function hashContents(contents: string): string {
  return `sha256-${createHash("sha256").update(contents).digest("hex")}`;
}
