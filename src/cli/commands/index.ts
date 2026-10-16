import type { Command } from "commander";

import { addCommand } from "./add";
import { configCommand } from "./config";
import { diffCommand } from "./diff";
import { doctorCommand } from "./doctor";
import { harnessCommand } from "./harness";
import { initCommand } from "./init";
import { listCommand } from "./list";
import { outdatedCommand } from "./outdated";
import { removeCommand } from "./remove";
import { syncCommand } from "./sync";
import { updateCommand } from "./update";
import { validateCommand } from "./validate";
import type { CommandContext, CommandModule } from "./types";

export type { CommandContext, CommandModule } from "./types";

/** Command modules available in the CLI. Later phases append to this list. */
export const commandModules: readonly CommandModule[] = [
  initCommand,
  validateCommand,
  listCommand,
  configCommand,
  addCommand,
  removeCommand,
  outdatedCommand,
  updateCommand,
  diffCommand,
  syncCommand,
  harnessCommand,
  doctorCommand,
];

export function registerCommands(
  program: Command,
  context: CommandContext,
): void {
  for (const commandModule of commandModules) {
    commandModule.register(program, context);
  }
}
