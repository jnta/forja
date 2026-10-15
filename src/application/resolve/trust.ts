import type { FilesystemPort } from "@/domain/filesystem";
import type { ComponentKind } from "@/domain/references";
import type {
  RiskSummary,
  TrustConsent,
  TrustEvaluation,
  TrustPolicy,
} from "@/domain/trust";

export interface RiskTarget {
  readonly kind: ComponentKind;
  readonly name: string;
  readonly version: string;
  readonly directory: string;
  readonly source: string;
}

async function listFiles(
  filesystem: FilesystemPort,
  target: string,
  prefix: string,
  out: string[],
): Promise<void> {
  const info = await filesystem.stat(target);
  if (!info || info.type === "symlink") return;
  if (info.type !== "directory") {
    out.push(prefix);
    return;
  }
  for (const name of (await filesystem.readDir(target)).sort()) {
    await listFiles(
      filesystem,
      filesystem.resolve(target, name),
      prefix.length === 0 ? name : `${prefix}/${name}`,
      out,
    );
  }
}

const REMOTE_PATTERN = /(?:https?:\/\/|github:|git:)[^\s"'`)\]]+/g;

/** Build the risk summary shown before installation (PRD 40). */
export async function assessRisk(
  filesystem: FilesystemPort,
  target: RiskTarget,
): Promise<RiskSummary> {
  const files: string[] = [];
  await listFiles(filesystem, target.directory, "", files);

  const scripts = files
    .filter((file) => file === "scripts" || file.startsWith("scripts/"))
    .sort();

  const remote = new Set<string>();
  for (const file of files) {
    if (!/\.(md|ya?ml)$/i.test(file)) continue;
    const absolute = filesystem.resolve(target.directory, file);
    let contents: string;
    try {
      contents = await filesystem.readFile(absolute);
    } catch {
      continue;
    }
    for (const match of contents.matchAll(REMOTE_PATTERN)) {
      remote.add(match[0].replace(/[.,;:]+$/, ""));
    }
  }

  return {
    package: `${target.kind}:${target.name}@${target.version}`,
    source: target.source,
    scripts,
    remoteReferences: [...remote].sort(),
    unsigned: true,
  };
}

/** Apply the trust policy to the collected risk summaries (PRD 41). */
export function evaluateTrust(
  policy: TrustPolicy,
  summaries: readonly RiskSummary[],
  consent?: TrustConsent,
): TrustEvaluation {
  const denied: RiskSummary[] = [];
  const requiresConfirmation: RiskSummary[] = [];

  for (const summary of summaries) {
    const decisions = [
      summary.scripts.length > 0 ? policy.scripts : "allow",
      summary.remoteReferences.length > 0 ? policy.remoteReferences : "allow",
      summary.unsigned ? policy.unsignedPackages : "allow",
    ] as const;

    if (decisions.includes("deny")) {
      denied.push(summary);
      continue;
    }
    if (decisions.includes("ask") && consent?.allow !== true) {
      requiresConfirmation.push(summary);
    }
  }

  return {
    allowed: denied.length === 0 && requiresConfirmation.length === 0,
    denied,
    requiresConfirmation,
  };
}
