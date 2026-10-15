import semver from "semver";
import { z } from "zod";

import type { HarnessEntry } from "@/domain/config";
import type { VerificationDefinition } from "@/domain/ir";
import type { ComponentKind, ComponentRef } from "@/domain/references";

/** Lowercase kebab-case, matching directory-based component ids. */
export const COMPONENT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export interface SchemaIssue {
  readonly path: string;
  readonly message: string;
}

export function parseComponentRef(
  kind: ComponentKind,
  value: string,
): ComponentRef | SchemaIssue {
  const at = value.indexOf("@");
  if (at === -1) {
    if (!COMPONENT_NAME_PATTERN.test(value)) {
      return { path: "", message: `invalid ${kind} reference "${value}"` };
    }
    return { kind, name: value };
  }

  const name = value.slice(0, at);
  const range = value.slice(at + 1);

  if (!COMPONENT_NAME_PATTERN.test(name)) {
    return { path: "", message: `invalid ${kind} reference name "${name}"` };
  }
  if (range.length === 0) {
    return { path: "", message: `invalid ${kind} reference "${value}": missing version range` };
  }
  if (semver.validRange(range) === null) {
    return {
      path: "",
      message: `invalid ${kind} reference "${value}": "${range}" is not a valid semver range`,
    };
  }

  return { kind, name, range };
}

export function isSchemaIssue(value: unknown): value is SchemaIssue {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    "path" in value &&
    !("kind" in value)
  );
}

/** Accepts `["testing@^2"]` or `{ testing: "^2" }` and yields `"name@range"`. */
export const componentNameList = z.union([
  z.array(z.string().min(1)),
  z.record(z.string(), z.string()),
]);

export function toNameList(
  value: readonly string[] | Readonly<Record<string, string>>,
): string[] {
  if (Array.isArray(value)) return [...value];
  return Object.entries(value).map(([name, range]) =>
    range.length === 0 ? name : `${name}@${range}`,
  );
}

/** Accepts a harness list or map with `{ enabled }` values. */
export const harnessList = z.union([
  z.array(z.string().min(1)),
  z.record(
    z.string(),
    z.union([z.boolean(), z.object({ enabled: z.boolean() }), z.null()]),
  ),
]);

export function toHarnessEntries(
  value: readonly string[] | Readonly<Record<string, boolean | { enabled: boolean } | null>>,
): HarnessEntry[] {
  if (Array.isArray(value)) return value.map((id) => ({ id, enabled: true }));
  return Object.entries(value).map(([id, entry]) => {
    if (entry === false) return { id, enabled: false };
    if (entry === true || entry === null) return { id, enabled: true };
    return { id, enabled: entry.enabled };
  });
}

const commandValue = z.union([z.string().min(1), z.object({ command: z.string().min(1) })]);

/** `fast`/`check`/`quick` and `full`/`verify` are interchangeable aliases. */
export const verificationInput = z.object({
  fast: commandValue.optional(),
  check: commandValue.optional(),
  quick: commandValue.optional(),
  full: commandValue.optional(),
  verify: commandValue.optional(),
});

export type VerificationInput = z.infer<typeof verificationInput>;

function commandOf(value: string | { command: string }): string {
  return typeof value === "string" ? value : value.command;
}

function resolveSlot(
  slot: "fast" | "full",
  values: ReadonlyArray<string | { command: string } | undefined>,
): { value: string } | SchemaIssue {
  const commands = values.filter((value) => value !== undefined).map(commandOf);
  const distinct = [...new Set(commands)];
  if (distinct.length > 1) {
    return {
      path: slot,
      message: `conflicting ${slot} verification aliases: ${distinct
        .map((command) => `"${command}"`)
        .join(", ")}`,
    };
  }
  return { value: distinct[0] ?? "" };
}

export function normalizeVerification(
  input: VerificationInput | undefined,
): { value: VerificationDefinition } | SchemaIssue {
  if (input === undefined) return { value: { fast: "", full: "" } };

  const fast = resolveSlot("fast", [input.fast, input.check, input.quick]);
  if (isSchemaIssue(fast)) return fast;
  const full = resolveSlot("full", [input.full, input.verify]);
  if (isSchemaIssue(full)) return full;

  return { value: { fast: fast.value, full: full.value } };
}
