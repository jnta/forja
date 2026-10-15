import type { SyncPlan } from "@/application/sync/planner";

const ACTION_PREFIX: Record<string, string> = {
  create: "+",
  update: "~",
  delete: "-",
  conflict: "!",
};

/** Render a plan as human-readable lines (PRD 21). */
export function renderPlan(plan: SyncPlan): string {
  if (plan.entries.every((entry) => entry.action === "unchanged")) {
    return "No changes.\n";
  }

  const lines: string[] = [];
  for (const entry of plan.entries) {
    if (entry.action === "unchanged") continue;
    lines.push(`${ACTION_PREFIX[entry.action] ?? "?"} ${entry.path}`);
    if (entry.diff) lines.push(entry.diff.trimEnd());
  }
  return `${lines.join("\n")}\n`;
}

export interface PlanSummary {
  readonly create: number;
  readonly update: number;
  readonly delete: number;
  readonly conflict: number;
  readonly unchanged: number;
}

export function summarizePlan(plan: SyncPlan): PlanSummary {
  return {
    create: plan.entries.filter((entry) => entry.action === "create").length,
    update: plan.entries.filter((entry) => entry.action === "update").length,
    delete: plan.entries.filter((entry) => entry.action === "delete").length,
    conflict: plan.entries.filter((entry) => entry.action === "conflict").length,
    unchanged: plan.entries.filter((entry) => entry.action === "unchanged").length,
  };
}
