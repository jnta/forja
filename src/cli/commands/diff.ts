import { runSync } from "@/application/use-cases/sync";

import { renderPlan } from "./plan-output";
import type { CommandModule } from "./types";

export const diffCommand: CommandModule = {
  register(program, context) {
    program
      .command("diff")
      .description("show generated changes without writing them")
      .option("--global", "operate on the global (personal) configuration")
      .option("--json", "emit machine-readable JSON")
      .action(async (options: { json?: boolean; global?: boolean }) => {
        const { services } = context;
        const report = await runSync(
          {
            filesystem: services.filesystem,
            yaml: services.yaml,
            adapters: services.adapters,
          },
          {
            paths: {
              projectDir: services.projectDir,
              globalDir: services.globalDir,
            },
            scope: options.global ? "global" : "project",
            mode: "dry-run",
          },
        );

        if (options.json) {
          context.stdout.write(
            `${JSON.stringify(
              {
                changes: report.plan.changes,
                entries: report.plan.entries.map((entry) => ({
                  path: entry.path,
                  action: entry.action,
                })),
                conflicts: report.plan.conflicts.map((conflict) => ({
                  path: conflict.path,
                  reason: conflict.reason,
                })),
              },
              null,
              2,
            )}\n`,
          );
          return;
        }

        services.reporter.reportAll(report.diagnostics);
        context.stdout.write(renderPlan(report.plan));
      });
  },
};
