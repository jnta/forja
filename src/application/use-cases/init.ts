import type { Diagnostic } from "@/domain/diagnostics";
import type { FilesystemPort } from "@/domain/filesystem";
import type {
  YamlDocumentPort,
  YamlParserPort,
  YamlSerializerPort,
} from "@/domain/serialization";

import { appendGitIgnoreEntries } from "../config/gitignore";
import { discoverStack, type DetectedStack } from "../discovery/stack";
import { GLOBAL_CONFIG_FILE, PROJECT_CONFIG_FILE } from "../library/paths";
import type { Scope } from "../scope";

export interface InitDeps {
  readonly filesystem: FilesystemPort;
  readonly yaml: YamlParserPort & YamlSerializerPort & YamlDocumentPort;
}

export interface InitOptions {
  readonly scope: Scope;
  readonly projectDir: string;
  readonly globalDir: string;
  readonly homeDir: string;
  readonly harnesses?: readonly string[];
  readonly packs?: readonly string[];
  readonly verification?: { readonly fast?: string; readonly full?: string };
  /** Overwrite an existing configuration file. */
  readonly force?: boolean;
}

export interface InitResult {
  readonly scope: Scope;
  readonly configFile: string;
  readonly created: readonly string[];
  readonly preserved: readonly string[];
  readonly stacks: readonly DetectedStack[];
  readonly suggestedPacks: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function verificationObject(
  verification: InitOptions["verification"],
): Record<string, string> | undefined {
  if (!verification) return undefined;
  const result: Record<string, string> = {};
  if (verification.fast) result.fast = verification.fast;
  if (verification.full) result.full = verification.full;
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Initialize Forja in a project or the global home (PRD 19, 75). Safe to run
 * repeatedly: an existing configuration file is preserved unless `force` is set.
 * Writes nothing on its own beyond the requested files, so a cancelled
 * interactive run leaves no partial setup.
 */
export async function initProject(
  deps: InitDeps,
  options: InitOptions,
): Promise<InitResult> {
  const { filesystem } = deps;
  const created: string[] = [];
  const preserved: string[] = [];
  const stacks = await discoverStack(filesystem, options.projectDir);
  const suggestedPacks = unique(stacks.flatMap((stack) => stack.suggestedPacks));

  if (options.scope === "global") {
    const file = filesystem.resolve(options.globalDir, GLOBAL_CONFIG_FILE);
    if ((await filesystem.exists(file)) && options.force !== true) {
      preserved.push(file);
    } else {
      await filesystem.mkdir(options.globalDir, { recursive: true });
      const config: Record<string, unknown> = {};
      if (options.harnesses && options.harnesses.length > 0) {
        config.defaultHarnesses = [...options.harnesses].sort();
      }
      const verification = verificationObject(options.verification);
      if (verification) config.verification = verification;
      await filesystem.writeFile(file, deps.yaml.stringify(config));
      created.push(file);
    }
    return {
      scope: "global",
      configFile: file,
      created,
      preserved,
      stacks,
      suggestedPacks,
      diagnostics: [],
    };
  }

  const file = filesystem.resolve(options.projectDir, PROJECT_CONFIG_FILE);
  if ((await filesystem.exists(file)) && options.force !== true) {
    preserved.push(file);
  } else {
    const config: Record<string, unknown> = { version: 1 };
    if (options.harnesses && options.harnesses.length > 0) {
      config.harnesses = Object.fromEntries(
        [...options.harnesses].sort().map((id) => [id, { enabled: true }]),
      );
    }
    if (options.packs && options.packs.length > 0) {
      config.packs = [...options.packs].sort();
    }
    const verification = verificationObject(options.verification);
    if (verification) config.verification = verification;
    await filesystem.writeFile(file, deps.yaml.stringify(config));
    created.push(file);
  }

  const gitignore = filesystem.resolve(options.projectDir, ".gitignore");
  const existing = (await filesystem.exists(gitignore))
    ? await filesystem.readFile(gitignore)
    : "";
  const updated = appendGitIgnoreEntries(existing);
  if (updated !== existing) {
    await filesystem.writeFile(gitignore, updated);
    created.push(gitignore);
  }

  return {
    scope: "project",
    configFile: file,
    created,
    preserved,
    stacks,
    suggestedPacks,
    diagnostics: [],
  };
}
