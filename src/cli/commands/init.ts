import { discoverStack } from "@/application/discovery/stack";
import { initProject } from "@/application/use-cases/init";

import type { CommandModule } from "./types";

interface InitFlags {
  readonly global?: boolean;
  readonly yes?: boolean;
  readonly force?: boolean;
  readonly harness?: string[];
  readonly pack?: string[];
  readonly fast?: string;
  readonly full?: string;
  readonly json?: boolean;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export const initCommand: CommandModule = {
  register(program, context) {
    program
      .command("init")
      .description("initialize Forja in this project or in your home")
      .option("--global", "initialize the global (personal) configuration")
      .option("--yes", "noninteractive: accept defaults")
      .option("--force", "overwrite an existing configuration file")
      .option("--harness <id>", "enable a harness (repeatable)", collect, [])
      .option("--pack <name>", "add a starter pack (repeatable)", collect, [])
      .option("--fast <command>", "fast verification command")
      .option("--full <command>", "full verification command")
      .option("--json", "emit machine-readable JSON")
      .action(async (options: InitFlags) => {
        const { services } = context;
        const scope = options.global ? "global" : "project";
        const interactive =
          options.yes !== true && process.stdin.isTTY === true;

        let harnesses = options.harness ?? [];
        let packs = options.pack ?? [];
        let fast = options.fast;
        let full = options.full;

        if (interactive) {
          const clack = await import("@clack/prompts");
          clack.intro("Forja — portable tooling for AI coding agents");

          const detected = services.adapters.map((adapter) => adapter.id);
          const harnessAnswer = await clack.multiselect({
            message: "Which harnesses should Forja configure?",
            options: detected.map((id) => ({ value: id, label: id })),
            initialValues: detected,
          });
          if (clack.isCancel(harnessAnswer)) {
            clack.cancel("Cancelled; nothing was written.");
            return;
          }
          harnesses = harnessAnswer as string[];

          const stacks = await discoverStack(services.filesystem, services.projectDir);
          const suggested = [
            ...new Set(stacks.flatMap((stack) => stack.suggestedPacks)),
          ].sort();
          if (stacks.length > 0) {
            clack.note(
              stacks.map((stack) => `${stack.label} (${stack.files.join(", ")})`).join("\n"),
              "Detected stack",
            );
          }
          if (suggested.length > 0) {
            const packAnswer = await clack.multiselect({
              message: "Select starter packs (suggested, not installed)",
              options: suggested.map((name) => ({ value: name, label: name })),
              initialValues: [],
            });
            if (clack.isCancel(packAnswer)) {
              clack.cancel("Cancelled; nothing was written.");
              return;
            }
            packs = packAnswer as string[];
          }

          const fastAnswer = await clack.text({
            message: "Fast verification command (optional)",
            defaultValue: "",
          });
          if (clack.isCancel(fastAnswer)) {
            clack.cancel("Cancelled; nothing was written.");
            return;
          }
          fast = String(fastAnswer) || undefined;

          const fullAnswer = await clack.text({
            message: "Full verification command (optional)",
            defaultValue: "",
          });
          if (clack.isCancel(fullAnswer)) {
            clack.cancel("Cancelled; nothing was written.");
            return;
          }
          full = String(fullAnswer) || undefined;
        }

        if (harnesses.length === 0) {
          harnesses = services.adapters.map((adapter) => adapter.id);
        }

        const result = await initProject(
          { filesystem: services.filesystem, yaml: services.yaml },
          {
            scope,
            projectDir: services.projectDir,
            globalDir: services.globalDir,
            homeDir: services.filesystem.homeDir(),
            harnesses,
            packs,
            verification: { fast, full },
            force: options.force,
          },
        );

        if (options.json) {
          context.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }

        for (const file of result.created) {
          context.stdout.write(`Created ${file}\n`);
        }
        for (const file of result.preserved) {
          context.stdout.write(`Preserved existing ${file}\n`);
        }
        if (result.suggestedPacks.length > 0) {
          context.stdout.write(
            `Suggested packs (not installed): ${result.suggestedPacks.join(", ")}\n`,
          );
        }
        context.stdout.write("Run `forja sync` to generate harness configuration.\n");
      });
  },
};
