export const ORCHESTRATOR_AGENT = "forja-orchestrator";
export const ENGINEER_AGENT = "forja-engineer";

export const ORCHESTRATOR_TOOLS: Record<string, boolean> = {
  read: false,
  write: false,
  edit: false,
  glob: false,
  grep: false,
  list: false,
  bash: false,
  task: false,
  todowrite: false,
  webfetch: false,
  websearch: false,
};

export const ENGINEER_TOOLS: Record<string, boolean> = {
  read: true,
  write: true,
  edit: true,
  glob: true,
  grep: true,
  list: true,
  bash: true,
};
