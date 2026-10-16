import { resolveScope, type Scope } from "@/application/scope";

import type { CliServices } from "../container";

/** Resolve project or global scope for a command. */
export function resolveCommandScope(
  services: CliServices,
  global?: boolean,
): ReturnType<typeof resolveScope> {
  const scope: Scope = global ? "global" : "project";
  return resolveScope({
    scope,
    projectDir: services.projectDir,
    globalDir: services.globalDir,
    homeDir: services.filesystem.homeDir(),
  });
}
