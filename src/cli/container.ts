import type { DiagnosticReporterPort } from "@/domain/diagnostics";
import type { FilesystemPort } from "@/domain/filesystem";
import type { HarnessAdapterPort } from "@/domain/harness-adapter";
import type { PackageSourcePort } from "@/domain/package-source";
import type { YamlParserPort } from "@/domain/serialization";
import { ConsoleDiagnosticReporter } from "@/infrastructure/cli/console-reporter";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";

/**
 * Services available to CLI commands. This is the CLI composition root: it is
 * the only place in `src/cli` allowed to import from `infrastructure`
 * (enforced by src/layer-boundaries.test.ts).
 */
export interface CliServices {
  readonly filesystem: FilesystemPort;
  readonly yaml: YamlParserPort;
  readonly packageSources: readonly PackageSourcePort[];
  readonly adapters: readonly HarnessAdapterPort[];
  readonly reporter: DiagnosticReporterPort;
  /** Directory of the project being operated on. */
  readonly projectDir: string;
  /** Root of the global Forja library (defaults to `~/.forja`). */
  readonly globalDir: string;
}

export interface CreateCliServicesOptions {
  readonly reporter?: DiagnosticReporterPort;
  /** Destination for the default console reporter. Defaults to stderr. */
  readonly stderr?: NodeJS.WritableStream;
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
    new ConsoleDiagnosticReporter(
      options.stderr ? { stream: options.stderr } : {},
    );

  const projectDir = options.projectDir ?? filesystem.cwd();
  const homeDir = options.homeDir ?? filesystem.homeDir();
  const globalDir =
    options.globalDir ??
    process.env.FORJA_HOME ??
    filesystem.resolve(homeDir, ".forja");

  return {
    filesystem,
    yaml: new YamlParser(),
    // Source adapters arrive in Phase 3 and compiler adapters in Phases 5–6.
    packageSources: [],
    adapters: [],
    reporter,
    projectDir,
    globalDir,
  };
}
