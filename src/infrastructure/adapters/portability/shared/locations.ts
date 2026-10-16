import type { FilesystemPort } from "@/domain/filesystem";
import type { ProjectContext } from "@/domain/harness-adapter";

/**
 * Native output locations per harness and scope. Project scope writes into the
 * repository; global scope writes into the user's home directories so a
 * personal library can configure every project (PRD 75).
 */
export interface AdapterLocations {
  readonly skillsDir: string;
  readonly agentsDir: string;
  readonly instructions: string;
}

function global(context: ProjectContext): boolean {
  return context.scope === "global";
}

export function opencodeLocations(
  filesystem: FilesystemPort,
  context: ProjectContext,
): AdapterLocations {
  if (global(context)) {
    return {
      skillsDir: filesystem.resolve(context.homeDir, ".agents", "skills"),
      agentsDir: filesystem.resolve(context.homeDir, ".config", "opencode", "agents"),
      instructions: filesystem.resolve(
        context.homeDir,
        ".config",
        "opencode",
        "AGENTS.md",
      ),
    };
  }
  return {
    skillsDir: filesystem.resolve(context.projectDir, ".agents", "skills"),
    agentsDir: filesystem.resolve(context.projectDir, ".opencode", "agents"),
    instructions: filesystem.resolve(context.projectDir, "AGENTS.md"),
  };
}

export function claudeLocations(
  filesystem: FilesystemPort,
  context: ProjectContext,
): AdapterLocations {
  if (global(context)) {
    return {
      skillsDir: filesystem.resolve(context.homeDir, ".claude", "skills"),
      agentsDir: filesystem.resolve(context.homeDir, ".claude", "agents"),
      instructions: filesystem.resolve(context.homeDir, ".claude", "CLAUDE.md"),
    };
  }
  return {
    skillsDir: filesystem.resolve(context.projectDir, ".claude", "skills"),
    agentsDir: filesystem.resolve(context.projectDir, ".claude", "agents"),
    instructions: filesystem.resolve(context.projectDir, "CLAUDE.md"),
  };
}

export function codexLocations(
  filesystem: FilesystemPort,
  context: ProjectContext,
): AdapterLocations {
  if (global(context)) {
    return {
      skillsDir: filesystem.resolve(context.homeDir, ".agents", "skills"),
      agentsDir: filesystem.resolve(context.homeDir, ".codex", "agents"),
      instructions: filesystem.resolve(context.homeDir, ".codex", "AGENTS.md"),
    };
  }
  return {
    skillsDir: filesystem.resolve(context.projectDir, ".agents", "skills"),
    agentsDir: filesystem.resolve(context.projectDir, ".codex", "agents"),
    instructions: filesystem.resolve(context.projectDir, "AGENTS.md"),
  };
}
