import { validateLibrary } from "@/application/use-cases/validate";

import { CliExit, ExitCode } from "../exit-codes";
import { resolveCommandScope } from "./paths";
import type { CommandModule } from "./types";

export const validateCommand: CommandModule = {
  register(program, context) {
    program
      .command("validate")
      .description("validate configuration and local definitions")
      .option("--global", "validate the global (personal) library")
      .option("--json", "emit machine-readable JSON")
      .action(async (options: { json?: boolean; global?: boolean }) => {
        const { services } = context;
        const { libraryPaths } = resolveCommandScope(services, options.global);
        const result = await validateLibrary(
          { filesystem: services.filesystem, yaml: services.yaml },
          libraryPaths,
        );

        if (options.json) {
          context.stdout.write(
            `${JSON.stringify(
              {
                valid: result.valid,
                summary: result.summary,
                diagnostics: result.diagnostics,
              },
              null,
              2,
            )}\n`,
          );
        } else {
          services.reporter.reportAll(result.diagnostics);
          context.stdout.write(
            result.valid
              ? `Valid. ${result.summary.skills} skills, ${result.summary.agents} agents, ${result.summary.workflows} workflows, ${result.summary.policies} policies, ${result.summary.packs} packs.\n`
              : `Invalid: ${result.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length} error(s).\n`,
          );
        }

        if (!result.valid) throw new CliExit(ExitCode.Config);
      });
  },
};
