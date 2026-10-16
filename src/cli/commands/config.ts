import { loadLibrary } from "@/application/library/load";

import { resolveCommandScope } from "./paths";
import type { CommandModule } from "./types";

function formatRefs(refs: ReadonlyArray<{ name: string; range?: string }>): string {
  if (refs.length === 0) return "(none)";
  return refs.map((ref) => (ref.range ? `${ref.name}@${ref.range}` : ref.name)).join(", ");
}

export const configCommand: CommandModule = {
  register(program, context) {
    program
      .command("config")
      .description("show the effective merged configuration")
      .option("--global", "show the global (personal) configuration")
      .option("--json", "emit machine-readable JSON")
      .action(async (options: { json?: boolean; global?: boolean }) => {
        const { services } = context;
        const { libraryPaths, scope } = resolveCommandScope(services, options.global);
        const library = await loadLibrary(
          { filesystem: services.filesystem, yaml: services.yaml },
          libraryPaths,
        );
        const { config } = library;

        if (options.json) {
          context.stdout.write(
            `${JSON.stringify({ scope, config, diagnostics: library.diagnostics }, null, 2)}\n`,
          );
          return;
        }

        services.reporter.reportAll(library.diagnostics);
        const lines = [
          `Scope: ${scope}`,
          `Version: ${config.version}`,
          `Harnesses: ${config.harnesses.length > 0 ? config.harnesses.map((h) => `${h.id}${h.enabled ? "" : " (disabled)"}`).join(", ") : "(none)"}`,
          `Skills: ${formatRefs(config.skills)}`,
          `Agents: ${formatRefs(config.agents)}`,
          `Workflows: ${formatRefs(config.workflows)}`,
          `Policies: ${formatRefs(config.policies)}`,
          `Packs: ${formatRefs(config.packs)}`,
          `Verification: fast=${config.verification.fast || "(unset)"} full=${config.verification.full || "(unset)"}`,
          `Strict compatibility: ${config.strict}`,
          `Instruction fallback: ${config.instructionFallback}`,
        ];
        context.stdout.write(`${lines.join("\n")}\n`);
      });
  },
};
