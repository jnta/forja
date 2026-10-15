import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Test-only helpers. Tests must never touch a developer's real home or global
 * configuration, so all filesystem activity happens under an isolated
 * temporary directory.
 */
export async function createTempDir(prefix = "forja-test-"): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function removeTempDir(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}
