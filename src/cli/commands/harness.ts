import {
  harnessInfo,
  listHarnesses,
  setHarnessEnabled,
} from "@/application/use-cases/harness";
import { ForjaError } from "@/domain/errors";

import type { CommandModule } from "./types";

function renderListings(
  listings: ReadonlyArray<{ id: string; enabled: boolean; installed: boolean }>,
): string {
  if (listings.length === 0) return "No harness adapters are registered.\n";
  const width = Math.max(...listings.map((listing) => listing.id.length), 7);
  const lines = listings.map(
    (listing) =>
      `  ${listing.id.padEnd(width)}  ${listing.enabled ? "enabled " : "disabled"}  ${listing.installed ? "installed" : "not found"}`,
  );
  return `HARNESS${" ".repeat(Math.max(width - 6, 1))}  STATUS    DETECTED\n${lines.join("\n")}\n`;
}

export const harnessCommand: CommandModule = {
  register(program, context) {
    const { services } = context;
    const deps = { filesystem: services.filesystem, yaml: services.yaml };
    const paths = { projectDir: services.projectDir, globalDir: services.globalDir };
    const adapterIds = services.adapters.map((adapter) => adapter.id);

    const harness = program
      .command("harness")
      .description("list, enable, disable and inspect harness adapters");

    harness
      .command("list")
      .description("list harness adapters")
      .option("--json", "emit machine-readable JSON")
      .action(async (options: { json?: boolean }) => {
        const listings = await listHarnesses(deps, services.adapters, paths);
        context.stdout.write(
          options.json
            ? `${JSON.stringify(listings, null, 2)}\n`
            : renderListings(listings),
        );
      });

    const toggle = (enabled: boolean) => async (id: string) => {
      if (!adapterIds.includes(id)) {
        throw new ForjaError(`unknown harness "${id}".`, "FORJA-CLI-003", {
          kind: "usage",
          resolution: `Known harnesses: ${adapterIds.join(", ") || "none"}.`,
        });
      }
      await setHarnessEnabled(deps, paths, id, enabled);
      context.stdout.write(`${enabled ? "Enabled" : "Disabled"} ${id}.\n`);
    };

    harness
      .command("enable")
      .argument("<id>", "harness id")
      .description("enable a harness in forja.yaml")
      .action(toggle(true));

    harness
      .command("disable")
      .argument("<id>", "harness id")
      .description("disable a harness in forja.yaml")
      .action(toggle(false));

    harness
      .command("info")
      .argument("<id>", "harness id")
      .description("show detection and state for a harness")
      .option("--json", "emit machine-readable JSON")
      .action(async (id: string, options: { json?: boolean }) => {
        const info = await harnessInfo(deps, services.adapters, paths, id);
        if (info === null) {
          throw new ForjaError(`unknown harness "${id}".`, "FORJA-CLI-003", {
            kind: "usage",
            resolution: `Known harnesses: ${adapterIds.join(", ") || "none"}.`,
          });
        }
        context.stdout.write(
          options.json
            ? `${JSON.stringify(info, null, 2)}\n`
            : [
                `${info.listing.id}`,
                `  enabled:   ${info.listing.enabled}`,
                `  installed: ${info.listing.installed}`,
                `  evidence:  ${info.listing.evidence}`,
                `  state:     ${info.state.summary}`,
                "",
              ].join("\n"),
        );
      });
  },
};
