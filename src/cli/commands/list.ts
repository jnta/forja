import { listLibrary } from "@/application/use-cases/list";

import { resolveCommandScope } from "./paths";
import type { CommandModule } from "./types";

function renderGroup(
  title: string,
  items: ReadonlyArray<{ id: string; description: string }>,
): string {
  if (items.length === 0) return `${title}\n  (none)\n`;
  const width = Math.max(...items.map((item) => item.id.length));
  const lines = items.map(
    (item) => `  ${item.id.padEnd(width)}  ${item.description}`,
  );
  return `${title}\n${lines.join("\n")}\n`;
}

export const listCommand: CommandModule = {
  register(program, context) {
    program
      .command("list")
      .description("list configured harnesses and available components")
      .option("--global", "list the global (personal) library")
      .option("--json", "emit machine-readable JSON")
      .action(async (options: { json?: boolean; global?: boolean }) => {
        const { services } = context;
        const { libraryPaths } = resolveCommandScope(services, options.global);
        const result = await listLibrary(
          { filesystem: services.filesystem, yaml: services.yaml },
          libraryPaths,
        );

        if (options.json) {
          context.stdout.write(
            `${JSON.stringify(
              {
                harnesses: result.harnesses,
                skills: result.skills,
                agents: result.agents,
                workflows: result.workflows,
                policies: result.policies,
                packs: result.packs,
              },
              null,
              2,
            )}\n`,
          );
          return;
        }

        services.reporter.reportAll(result.diagnostics);
        const harnesses = result.harnesses.map((harness) => ({
          id: harness.id,
          description: harness.enabled ? "enabled" : "disabled",
        }));
        context.stdout.write(
          [
            renderGroup("Harnesses", harnesses),
            renderGroup("Skills", result.skills),
            renderGroup("Agents", result.agents),
            renderGroup("Workflows", result.workflows),
            renderGroup("Policies", result.policies),
            renderGroup("Packs", result.packs),
          ].join("\n"),
        );
      });
  },
};
