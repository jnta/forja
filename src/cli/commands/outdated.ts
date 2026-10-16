import { outdatedPackages } from "@/application/packages/outdated";

import { packageDeps, packagePaths } from "./add";
import type { CommandModule } from "./types";

export const outdatedCommand: CommandModule = {
  register(program, context) {
    program
      .command("outdated")
      .description("report current, wanted and latest package versions")
      .option("--global", "check the global (personal) configuration")
      .option("--json", "emit machine-readable JSON")
      .action(async (options: { global?: boolean; json?: boolean }) => {
        const { services } = context;
        const result = await outdatedPackages(
          packageDeps(services),
          packagePaths(services, options.global),
        );
        services.reporter.reportAll(result.diagnostics);

        if (options.json) {
          context.stdout.write(
            `${JSON.stringify(
              { rows: result.rows, unavailableSources: result.unavailableSources },
              null,
              2,
            )}\n`,
          );
          return;
        }

        if (result.rows.length === 0) {
          context.stdout.write("No packages configured.\n");
          return;
        }
        const lines = ["PACKAGE             CURRENT   WANTED    LATEST    STATUS"];
        for (const row of result.rows) {
          lines.push(
            `  ${row.name.padEnd(16)}  ${(row.current ?? "-").padEnd(8)}  ${(row.wanted ?? "-").padEnd(8)}  ${(row.latest ?? "-").padEnd(8)}  ${row.status}`,
          );
        }
        context.stdout.write(`${lines.join("\n")}\n`);
      });
  },
};
