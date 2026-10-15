import { createHash } from "node:crypto";

import type { FilesystemPort } from "@/domain/filesystem";

interface HashedFile {
  readonly path: string;
  readonly contents: string;
}

async function collect(
  filesystem: FilesystemPort,
  target: string,
  prefix: string,
  out: HashedFile[],
): Promise<void> {
  const info = await filesystem.stat(target);
  if (!info) return;
  if (info.type === "symlink") return; // never follow symlinks out of the package
  if (info.type !== "directory") {
    out.push({ path: prefix, contents: await filesystem.readFile(target) });
    return;
  }
  for (const name of (await filesystem.readDir(target)).sort()) {
    await collect(filesystem, filesystem.resolve(target, name), `${prefix}${name}`, out);
  }
}

/**
 * Deterministic `sha256-<base64>` digest of a package file or directory.
 * Symlinks are ignored so a package cannot escape its extraction root.
 */
export async function hashPath(
  filesystem: FilesystemPort,
  target: string,
): Promise<string> {
  const files: HashedFile[] = [];
  await collect(filesystem, target, "", files);
  const hash = createHash("sha256");
  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.contents);
    hash.update("\0");
  }
  return `sha256-${hash.digest("hex")}`;
}
