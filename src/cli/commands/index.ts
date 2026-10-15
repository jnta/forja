import type { Command } from "commander";

import { diffCommand } from "./diff";
import { listCommand } from "./list";
import { syncCommand } from "./sync";
import { validateCommand } from "./validate";
import type { CommandContext, CommandModule } from "./types";

export type { CommandContext, CommandModule } from "./types";

/** Command modules available in the CLI. Later phases append to this list. */
export const commandModules: readonly CommandModule[] = [
  validateCommand,
  listCommand,
  diffCommand,
  syncCommand,
];

export function registerCommands(
  program: Command,
  context: CommandContext,
): void {
  for (const commandModule of commandModules) {
    commandModule.register(program, context);
  }
}
