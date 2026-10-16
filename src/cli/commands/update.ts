import { updatePackages } from "@/application/packages/update";
import { runSync } from "@/application/use-cases/sync";
import type { ComponentKind } from "@/domain/references";

import { CliExit, ExitCode } from "../exit-codes";
import { packageDeps, packagePaths } from "./add";
import type { CommandModule } from "./types";

export const updateCommand: CommandModule = {
  register(program, context) {
    program
      .command("update")
      .description("update packages within their configured ranges")
      .argument("[name]", "only update this package")
      .option("--kind <kind>", "restrict to a component kind")
      .option("--dry-run", "preview without applying")
      .option("--global", "update the global (personal) configuration")
      .option("--yes", "accept the trust confirmation")
      .option("--json", "emit machine-readable JSON")
      .action(
        async (
          name: string | undefined,
          options: {
            kind?: string;
            dryRun?: boolean;
            global?: boolean;
            yes?: boolean;
            json?: boolean;
          },
        ) => {
          const { services } = context;
          const paths = packagePaths(services, options.global);
          const result = await updatePackages(packageDeps(services), {
            ...paths,
            target: name,
            kind: options.kind as ComponentKind | undefined,
            dryRun: options.dryRun,
            consent: options.yes ? { allow: true } : undefined,
          });
          services.reporter.reportAll(result.diagnostics);

          if (options.json) {
            context.stdout.write(
              `${JSON.stringify(
                {
                  changes: result.changes,
                  skippedMajor: result.skippedMajor,
                  pinned: result.pinned,
                  applied: result.applied,
                },
                null,
                2,
              )}\n`,
            );
          } else if (result.changes.length === 0) {
            context.stdout.write("Everything is up to date.\n");
          } else {
            for (const change of result.changes) {
              context.stdout.write(
                `  ${change.name.padEnd(16)} ${change.from ?? "-"} → ${change.to}\n`,
              );
            }
            for (const skipped of result.skippedMajor) {
              context.stdout.write(
                `  ${skipped.name.padEnd(16)} ${skipped.current ?? "-"} → ${skipped.latest}  major update skipped\n`,
              );
            }
          }

          if (result.aborted) throw new CliExit(ExitCode.Failure);
          if (options.dryRun || result.changes.length === 0) return;

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
          if (!options.json) {
            context.stdout.write(
              `Updated ${result.changes.length} package(s); synced ${sync.applied} file(s).\n`,
            );
          }
        },
      );
  },
};
