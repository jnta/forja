import { removePackage } from "@/application/packages/remove";
import { runSync } from "@/application/use-cases/sync";
import type { ComponentKind } from "@/domain/references";

import { packageDeps, packagePaths } from "./add";
import type { CommandModule } from "./types";

export const removeCommand: CommandModule = {
  register(program, context) {
    program
      .command("remove")
      .description("remove a package and prune unreferenced content")
      .argument("<name>", "package name")
      .option("--kind <kind>", "component kind", "skill")
      .option("--global", "remove from the global (personal) configuration")
      .option("--json", "emit machine-readable JSON")
      .action(
        async (
          name: string,
          options: { kind?: string; global?: boolean; json?: boolean },
        ) => {
          const { services } = context;
          const paths = packagePaths(services, options.global);
          const result = await removePackage(packageDeps(services), {
            ...paths,
            name,
            kind: (options.kind as ComponentKind) ?? "skill",
          });
          services.reporter.reportAll(result.diagnostics);

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
                removed: result.removed,
                retained: result.retained,
                notFound: result.notFound,
                synced: sync.applied,
              })}\n`,
            );
          } else if (result.notFound) {
            context.stdout.write(`${result.kind} "${name}" is not configured.\n`);
          } else {
            context.stdout.write(
              `Removed ${result.kind} ${name}; pruned ${result.removed.length} package(s); synced ${sync.applied} file(s).\n`,
            );
          }
        },
      );
  },
};
