import { addPackage, type PackageDeps } from "@/application/packages/add";
import { runSync } from "@/application/use-cases/sync";
import { ForjaError } from "@/domain/errors";
import type { ComponentKind } from "@/domain/references";

import { CliExit, ExitCode } from "../exit-codes";
import type { CommandContext, CommandModule } from "./types";

const KINDS: readonly ComponentKind[] = ["skill", "agent", "workflow", "policy", "pack"];

export function packageDeps(services: CommandContext["services"]): PackageDeps {
  return {
    filesystem: services.filesystem,
    yaml: services.yaml,
    cache: services.cache,
    createSources: services.createSources,
    stagingRoot: services.stagingRoot,
  };
}

export function packagePaths(
  services: CommandContext["services"],
  global?: boolean,
) {
  return {
    scope: (global ? "global" : "project") as "global" | "project",
    projectDir: services.projectDir,
    globalDir: services.globalDir,
    homeDir: services.filesystem.homeDir(),
  };
}

export const addCommand: CommandModule = {
  register(program, context) {
    program
      .command("add")
      .description("add a package (skill, agent, workflow, policy or pack)")
      .argument("<args...>", "optional kind followed by the package reference")
      .option("--kind <kind>", "component kind")
      .option("--global", "add to the global (personal) configuration")
      .option("--yes", "accept the trust confirmation")
      .option("--json", "emit machine-readable JSON")
      .action(
        async (
          args: string[],
          options: { kind?: string; global?: boolean; yes?: boolean; json?: boolean },
        ) => {
          const { services } = context;
          let kind = options.kind as ComponentKind | undefined;
          let input: string;
          if (args.length === 1) {
            input = args[0];
          } else if (args.length === 2 && KINDS.includes(args[0] as ComponentKind)) {
            kind = args[0] as ComponentKind;
            input = args[1];
          } else {
            throw new ForjaError(
              "usage: forja add [skill|agent|workflow|policy|pack] <ref>",
              "FORJA-CLI-004",
              { kind: "usage" },
            );
          }

          const paths = packagePaths(services, options.global);
          const result = await addPackage(packageDeps(services), {
            ...paths,
            input,
            kind,
            consent: options.yes ? { allow: true } : undefined,
          });
          services.reporter.reportAll(result.diagnostics);

          if (result.aborted) {
            if (options.json) {
              context.stdout.write(
                `${JSON.stringify({ aborted: true, requiresConfirmation: result.requiresConfirmation })}\n`,
              );
            } else {
              context.stdout.write(
                result.requiresConfirmation
                  ? "Confirmation required; re-run with --yes.\n"
                  : "Add aborted.\n",
              );
            }
            throw new CliExit(
              result.requiresConfirmation ? ExitCode.Conflict : ExitCode.Failure,
            );
          }

          const sync = await runSync(
            {
              filesystem: services.filesystem,
              yaml: services.yaml,
              adapters: services.adapters,
            },
            {
              paths: { projectDir: services.projectDir, globalDir: services.globalDir },
              scope: paths.scope,
              mode: "apply",
            },
          );
          services.reporter.reportAll(sync.diagnostics);

          if (options.json) {
            context.stdout.write(
              `${JSON.stringify({
                added: { kind: result.kind, name: result.name },
                installed: result.installed,
                synced: sync.applied,
              })}\n`,
            );
          } else {
            context.stdout.write(
              `Added ${result.kind} ${result.name} (${result.packages.length} package(s)); synced ${sync.applied} file(s).\n`,
            );
          }
        },
      );
  },
};
