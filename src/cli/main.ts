import { Command, CommanderError } from "commander";

import { isForjaError } from "@/domain/errors";

import { registerCommands } from "./commands";
import { createCliServices, type CliServices } from "./container";
import { formatForjaError, formatUnexpectedError } from "./errors";
import { ExitCode, exitCodeFor, isCliExit, type ExitCodeValue } from "./exit-codes";
import { CLI_VERSION } from "./version";

export interface CliIo {
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

export interface RunCliOptions {
  /** Arguments without `node`/script, as passed by tests. */
  readonly argv?: readonly string[];
  readonly services?: CliServices;
  readonly version?: string;
  readonly stdout?: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
}

/**
 * Build the Commander program. Pure and side-effect free (it never touches the
 * process streams unless the caller passes them), so tests can parse arguments
 * in-process.
 */
export function buildProgram(
  services: CliServices,
  io: CliIo,
  version: string,
): Command {
  const program = new Command();

  program
    .name("forja")
    .description("Portable tooling for AI coding agents.")
    .version(version, "-v, --version", "print the Forja CLI version")
    .helpOption("-h, --help", "display help for a command")
    .allowExcessArguments(false)
    .showHelpAfterError()
    .configureOutput({
      writeOut: (text) => {
        io.stdout.write(text);
      },
      writeErr: (text) => {
        io.stderr.write(text);
      },
    });

  registerCommands(program, { services, stdout: io.stdout, stderr: io.stderr });

  program.exitOverride();
  return program;
}

function handleFailure(
  error: unknown,
  stderr: NodeJS.WritableStream,
): ExitCodeValue {
  if (isCliExit(error)) return error.code;

  if (error instanceof CommanderError) {
    // Help and version exit 0 and have already written their output; any other
    // Commander error is a parse/usage failure whose message was just printed.
    return error.exitCode === 0 ? ExitCode.Success : ExitCode.Usage;
  }

  if (isForjaError(error)) {
    stderr.write(formatForjaError(error));
    return exitCodeFor(error);
  }

  stderr.write(formatUnexpectedError(error));
  return ExitCode.Failure;
}

/**
 * Parse arguments and execute the matched command.
 * Returns the process exit code instead of exiting, so callers (including
 * tests) stay in control. Only `src/cli/index.ts` assigns it to the process.
 */
export async function runCli(options: RunCliOptions = {}): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const services =
    options.services ?? createCliServices({ stderr });
  const program = buildProgram(
    services,
    { stdout, stderr },
    options.version ?? CLI_VERSION,
  );

  const argv = options.argv ? [...options.argv] : process.argv.slice(2);

  try {
    if (argv.length === 0) {
      program.outputHelp();
      return ExitCode.Success;
    }
    await program.parseAsync(argv, { from: "user" });
    return ExitCode.Success;
  } catch (error) {
    return handleFailure(error, stderr);
  }
}
