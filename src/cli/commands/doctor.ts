import { runDoctor } from "@/application/use-cases/doctor";

import { CliExit, ExitCode } from "../exit-codes";
import type { CommandModule } from "./types";

const SYMBOL: Record<string, string> = { ok: "✓", warning: "!", error: "✗" };

export const doctorCommand: CommandModule = {
  register(program, context) {
    program
      .command("doctor")
      .description("diagnose the environment, configuration and compatibility")
      .option("--global", "diagnose the global (personal) configuration")
      .option("--json", "emit machine-readable JSON")
      .action(async (options: { json?: boolean; global?: boolean }) => {
        const { services } = context;
        const report = await runDoctor(
          {
            filesystem: services.filesystem,
            yaml: services.yaml,
            adapters: services.adapters,
            nodeVersion: process.version,
          },
          {
            scope: options.global ? "global" : "project",
            projectDir: services.projectDir,
            globalDir: services.globalDir,
            homeDir: services.filesystem.homeDir(),
          },
        );

        if (options.json) {
          context.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        } else {
          const lines = ["Forja Doctor", ""];
          for (const check of report.checks) {
            lines.push(`  ${SYMBOL[check.status] ?? "?"} ${check.message}`);
          }
          lines.push("");
          lines.push(
            report.errors > 0
              ? `Status: ${report.errors} error(s), ${report.warnings} warning(s)`
              : report.warnings > 0
                ? `Status: healthy with ${report.warnings} warning(s)`
                : "Status: healthy",
          );
          context.stdout.write(`${lines.join("\n")}\n`);
        }

        if (!report.healthy) throw new CliExit(ExitCode.Failure);
      });
  },
};
