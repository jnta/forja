/**
 * Filesystem boundary.
 *
 * Domain and application code never touch `node:fs` directly; they depend on
 * this port so tests can use in-memory or temporary implementations and the
 * CLI stays portable across platforms. Paths are absolute unless documented
 * otherwise.
 */
export type FileType = "file" | "directory" | "symlink" | "other";

export interface FileInfo {
  readonly path: string;
  readonly type: FileType;
  readonly size: number;
}

export interface WriteFileOptions {
  /** POSIX permission bits, e.g. `0o755` for an executable script. */
  readonly mode?: number;
}

export interface FilesystemPort {
  /** Current working directory of the process. */
  cwd(): string;
  /** User home directory, used for the global Forja library. */
  homeDir(): string;
  /** Resolve path segments against the current working directory. */
  resolve(...segments: readonly string[]): string;
  exists(path: string): Promise<boolean>;
  /** Returns `null` when the path does not exist. */
  stat(path: string): Promise<FileInfo | null>;
  /** Resolve symlinks; used to detect escapes outside a component directory. */
  realpath(path: string): Promise<string>;
  readFile(path: string): Promise<string>;
  writeFile(
    path: string,
    contents: string,
    options?: WriteFileOptions,
  ): Promise<void>;
  /** Directory entry names, not fully-qualified paths. */
  readDir(path: string): Promise<string[]>;
  mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void>;
  /** Rename/move a file or directory (used for atomic writes). */
  rename(from: string, to: string): Promise<void>;
  remove(
    path: string,
    options?: { readonly recursive?: boolean; readonly force?: boolean },
  ): Promise<void>;
}
