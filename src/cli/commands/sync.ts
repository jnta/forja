import { runSync } from "@/application/use-cases/sync";

import { CliExit, ExitCode } from "../exit-codes";
import { renderPlan } from "./plan-output";
import type { CommandModule } from "./types";

interface SyncFlags {
  readonly dryRun?: boolean;
  readonly check?: boolean;
  readonly overwrite?: boolean;
  readonly keepLocal?: boolean;
  readonly global?: boolean;
  readonly json?: boolean;
}

export const syncCommand: CommandModule = {
  register(program, context) {
    program
      .command("sync")
      .description("generate harness configuration from the Forja library")
      .option("--dry-run", "show changes without writing them")
      .option("--check", "exit non-zero when changes are required")
      .option("--overwrite", "overwrite conflicting managed files")
      .option("--keep-local", "keep conflicting files and report drift")
      .option("--global", "synchronize the global (personal) configuration")
      .option("--json", "emit machine-readable JSON")
      .action(async (options: SyncFlags) => {
        const { services } = context;
        const mode = options.check ? "check" : options.dryRun ? "dry-run" : "apply";

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
            mode,
            overwrite: options.overwrite,
            keepLocal: options.keepLocal,
          },
        );

        if (options.json) {
          context.stdout.write(
            `${JSON.stringify(
              {
                mode,
                changes: report.plan.changes,
                applied: report.applied,
                deleted: report.deleted,
                drift: report.drift,
                aborted: report.aborted,
                conflicts: report.plan.conflicts.map((conflict) => ({
                  path: conflict.path,
                  reason: conflict.reason,
                })),
                diagnostics: report.diagnostics,
              },
              null,
              2,
            )}\n`,
          );
        } else {
          services.reporter.reportAll(report.diagnostics);
        }

        if (mode === "check") {
          const drift = report.plan.changes > 0 || report.plan.conflicts.length > 0;
          if (!options.json) {
            context.stdout.write(drift ? "Drift detected.\n" : "Up to date.\n");
          }
          if (drift) throw new CliExit(ExitCode.Drift);
          return;
        }

        if (mode === "dry-run") {
          if (!options.json) context.stdout.write(renderPlan(report.plan));
          return;
        }

        if (report.aborted) {
          throw new CliExit(
            report.plan.conflicts.length > 0 ? ExitCode.Conflict : ExitCode.Failure,
          );
        }

        if (!options.json) {
          context.stdout.write(
            `Synced ${report.applied} file(s), removed ${report.deleted}.\n`,
          );
          if (report.drift.length > 0) {
            context.stdout.write(
              `Unresolved drift (kept local): ${report.drift.join(", ")}\n`,
            );
          }
        }
      });
  },
};
