import type { ContentCachePort } from "@/domain/cache";
import type { DiagnosticReporterPort } from "@/domain/diagnostics";
import type { FilesystemPort } from "@/domain/filesystem";
import type { HarnessAdapterPort } from "@/domain/harness-adapter";
import type { PackageSourcePort } from "@/domain/package-source";
import type {
  YamlDocumentPort,
  YamlParserPort,
  YamlSerializerPort,
} from "@/domain/serialization";
import { parseSourceSpec } from "@/application/resolve/source-spec";
import type { SourceBinding } from "@/application/resolve/resolver";
import { FilesystemContentCache } from "@/infrastructure/cache/content-cache";
import { ConsoleDiagnosticReporter, type ReporterLevel } from "@/infrastructure/cli/console-reporter";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { ClaudeCompilerAdapter } from "@/infrastructure/adapters/portability/claude/claude-adapter";
import { CodexCompilerAdapter } from "@/infrastructure/adapters/portability/codex/codex-adapter";
import { OpenCodeCompilerAdapter } from "@/infrastructure/adapters/portability/opencode/opencode-adapter";
import { GitSource } from "@/infrastructure/sources/git-source";
import { LocalSource } from "@/infrastructure/sources/local-source";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";

/**
 * Services available to CLI commands. This is the CLI composition root: it is
 * the only place in `src/cli` allowed to import from `infrastructure`
 * (enforced by src/layer-boundaries.test.ts).
 */
export interface CliServices {
  readonly filesystem: FilesystemPort;
  readonly yaml: YamlParserPort & YamlSerializerPort & YamlDocumentPort;
  readonly packageSources: readonly PackageSourcePort[];
  readonly adapters: readonly HarnessAdapterPort[];
  readonly reporter: DiagnosticReporterPort;
  readonly cache: ContentCachePort;
  readonly stagingRoot: string;
  readonly createSources: (sources: readonly string[]) => readonly SourceBinding[];
  /** Directory of the project being operated on. */
  readonly projectDir: string;
  /** Root of the global Forja library (defaults to `~/.forja`). */
  readonly globalDir: string;
}

export interface CreateCliServicesOptions {
  readonly reporter?: DiagnosticReporterPort;
  /** Destination for the default console reporter. Defaults to stderr. */
  readonly stderr?: NodeJS.WritableStream;
  /** Console reporter verbosity. */
  readonly level?: ReporterLevel;
  readonly projectDir?: string;
  readonly globalDir?: string;
  readonly homeDir?: string;
}

export function createCliServices(
  options: CreateCliServicesOptions = {},
): CliServices {
  const filesystem = new NodeFilesystem();
  const reporter =
    options.reporter ??
    new ConsoleDiagnosticReporter({
      ...(options.stderr ? { stream: options.stderr } : {}),
      ...(options.level ? { level: options.level } : {}),
    });

  const projectDir = options.projectDir ?? filesystem.cwd();
  const homeDir = options.homeDir ?? filesystem.homeDir();
  const globalDir =
    options.globalDir ??
    process.env.FORJA_HOME ??
    filesystem.resolve(homeDir, ".forja");

  const createSources = (sources: readonly string[]): readonly SourceBinding[] =>
    sources.flatMap((raw) => {
      const parsed = parseSourceSpec(raw);
      if (!parsed.ok) return [];
      const port =
        parsed.spec.kind === "git" ? new GitSource() : new LocalSource(filesystem);
      return [{ spec: parsed.spec, port }];
    });

  return {
    filesystem,
    yaml: new YamlParser(),
    packageSources: [],
    adapters: [
      new OpenCodeCompilerAdapter({ filesystem }),
      new ClaudeCompilerAdapter({ filesystem }),
      new CodexCompilerAdapter({ filesystem }),
    ],
    reporter,
    cache: new FilesystemContentCache(filesystem.resolve(globalDir, "cache")),
    stagingRoot: filesystem.resolve(globalDir, "staging"),
    createSources,
    projectDir,
    globalDir,
  };
}
