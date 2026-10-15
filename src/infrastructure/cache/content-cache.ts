import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";

import type { ContentCachePort } from "@/domain/cache";

/**
 * Content-addressed cache keyed by the `sha256-<hex>` integrity digest.
 * Copying never follows symlinks outside the source directory (Node's `cp`
 * copies links as links by default).
 */
export class FilesystemContentCache implements ContentCachePort {
  constructor(private readonly root: string) {}

  private entry(integrity: string): string {
    return path.join(this.root, integrity);
  }

  async has(integrity: string): Promise<boolean> {
    try {
      await stat(this.entry(integrity));
      return true;
    } catch {
      return false;
    }
  }

  async directoryFor(integrity: string): Promise<string> {
    return this.entry(integrity);
  }

  async store(integrity: string, sourceDirectory: string): Promise<string> {
    const target = this.entry(integrity);
    await mkdir(this.root, { recursive: true });
    await cp(sourceDirectory, target, { recursive: true, force: true });
    return target;
  }
}
