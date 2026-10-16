import { constants } from "node:fs";
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type {
  FileInfo,
  FileType,
  FilesystemPort,
  WriteFileOptions,
} from "@/domain/filesystem";

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function toFileType(stats: Awaited<ReturnType<typeof lstat>>): FileType {
  if (stats.isFile()) return "file";
  if (stats.isDirectory()) return "directory";
  if (stats.isSymbolicLink()) return "symlink";
  return "other";
}

/** Node implementation of `FilesystemPort`. */
export class NodeFilesystem implements FilesystemPort {
  cwd(): string {
    return process.cwd();
  }

  homeDir(): string {
    return homedir();
  }

  resolve(...segments: readonly string[]): string {
    return path.resolve(...segments);
  }

  async exists(target: string): Promise<boolean> {
    try {
      await access(target, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async isWritable(target: string): Promise<boolean> {
    try {
      await access(target, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  async stat(target: string): Promise<FileInfo | null> {
    try {
      const stats = await lstat(target);
      return { path: target, type: toFileType(stats), size: stats.size };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  readFile(target: string): Promise<string> {
    return readFile(target, "utf8");
  }

  realpath(target: string): Promise<string> {
    return realpath(target);
  }

  async writeFile(
    target: string,
    contents: string,
    options: WriteFileOptions = {},
  ): Promise<void> {
    await writeFile(target, contents, {
      encoding: "utf8",
      mode: options.mode,
    });
  }

  readDir(target: string): Promise<string[]> {
    return readdir(target);
  }

  async mkdir(
    target: string,
    options: { readonly recursive?: boolean } = {},
  ): Promise<void> {
    await mkdir(target, { recursive: options.recursive ?? false });
  }

  async rename(from: string, to: string): Promise<void> {
    await rename(from, to);
  }

  async copy(from: string, to: string): Promise<void> {
    await cp(from, to, { recursive: true, force: true });
  }

  async remove(
    target: string,
    options: { readonly recursive?: boolean; readonly force?: boolean } = {},
  ): Promise<void> {
    await rm(target, {
      recursive: options.recursive ?? false,
      force: options.force ?? false,
    });
  }
}
