import { z } from "zod";

import type { Diagnostic } from "@/domain/diagnostics";
import { LOCKFILE_VERSION, type LockEntry, type Lockfile } from "@/domain/lockfile";
import type { ComponentKind } from "@/domain/references";

import { CODES, makeDiagnostic } from "../library/diagnostics";

const KINDS: readonly ComponentKind[] = [
  "skill",
  "agent",
  "workflow",
  "policy",
  "pack",
];

const PLURAL: Record<ComponentKind, string> = {
  skill: "skills",
  agent: "agents",
  workflow: "workflows",
  policy: "policies",
  pack: "packs",
};

const SINGULAR: Record<string, ComponentKind> = {
  skills: "skill",
  agents: "agent",
  workflows: "workflow",
  policies: "policy",
  packs: "pack",
};

const entrySchema = z.object({
  version: z.string().min(1),
  source: z.string().min(1),
  integrity: z.string().min(1),
  commit: z.string().min(1).optional(),
  dependencies: z.array(z.string().min(1)).default([]),
});

export function serializeLockfile(lockfile: Lockfile): Record<string, unknown> {
  const output: Record<string, unknown> = {
    lockfileVersion: lockfile.lockfileVersion,
  };

  for (const kind of KINDS) {
    const entries = lockfile.entries
      .filter((entry) => entry.kind === kind)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length === 0) continue;

    const group: Record<string, unknown> = {};
    for (const entry of entries) {
      group[entry.name] = {
        version: entry.version,
        source: entry.source,
        integrity: entry.integrity,
        ...(entry.commit ? { commit: entry.commit } : {}),
        dependencies: entry.dependencies,
      };
    }
    output[PLURAL[kind]] = group;
  }

  return output;
}

export function parseLockfile(
  raw: unknown,
  source: string,
  diagnostics: Diagnostic[],
): Lockfile | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.invalidSchema,
        message: "lockfile must be a YAML mapping",
        file: source,
      }),
    );
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (record.lockfileVersion !== LOCKFILE_VERSION) {
    diagnostics.push(
      makeDiagnostic({
        code: CODES.unsupportedVersion,
        message: `unsupported lockfileVersion ${String(record.lockfileVersion)}; expected ${LOCKFILE_VERSION}`,
        file: source,
        field: "lockfileVersion",
      }),
    );
    return null;
  }

  const entries: LockEntry[] = [];
  for (const [key, kind] of Object.entries(SINGULAR)) {
    const group = record[key];
    if (group === undefined) continue;
    if (typeof group !== "object" || group === null || Array.isArray(group)) {
      diagnostics.push(
        makeDiagnostic({
          code: CODES.invalidSchema,
          message: `"${key}" must be a mapping of name to lock entry`,
          file: source,
          field: key,
        }),
      );
      return null;
    }
    for (const [name, value] of Object.entries(group as Record<string, unknown>)) {
      const parsed = entrySchema.safeParse(value);
      if (!parsed.success) {
        diagnostics.push(
          makeDiagnostic({
            code: CODES.invalidSchema,
            message: `invalid lock entry for ${name}: ${parsed.error.issues[0]?.message ?? "invalid"}`,
            file: source,
            field: `${key}.${name}`,
          }),
        );
        return null;
      }
      entries.push({
        kind,
        name,
        version: parsed.data.version,
        source: parsed.data.source,
        integrity: parsed.data.integrity,
        commit: parsed.data.commit,
        dependencies: parsed.data.dependencies,
      });
    }
  }

  entries.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name),
  );
  return { lockfileVersion: LOCKFILE_VERSION, entries };
}
