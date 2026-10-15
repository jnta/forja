import type { Command } from "commander";

import type { CliServices } from "../container";

export interface CommandContext {
  readonly services: CliServices;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

export interface CommandModule {
  register(program: Command, context: CommandContext): void;
}
