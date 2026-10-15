/** On-disk layout and file names for the local Forja library. */
export const PROJECT_LIBRARY_DIR = ".forja";
export const GLOBAL_CONFIG_FILE = "config.yaml";
export const PROJECT_CONFIG_FILE = "forja.yaml";
export const LOCAL_CONFIG_FILE = "forja.local.yaml";

/** `forja.local.yaml` is uncommitted and must stay out of Git (PRD 71). */
export const LOCAL_CONFIG_IGNORE_ENTRY = "forja.local.yaml";

export const SKILL_ENTRY = "SKILL.md";
export const SKILL_MANIFEST = "skill.yaml";
export const AGENT_ENTRY = "AGENT.md";
export const AGENT_MANIFEST = "agent.yaml";

export const DEFINITION_DIRS = {
  skills: "skills",
  agents: "agents",
  workflows: "workflows",
  policies: "policies",
  packs: "packs",
} as const;

export const SKILL_RESOURCE_DIRS = ["references", "scripts", "assets"] as const;
