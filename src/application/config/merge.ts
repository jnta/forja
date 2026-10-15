import type { Diagnostic } from "@/domain/diagnostics";
import type { ForjaConfig, HarnessEntry } from "@/domain/config";
import type { VerificationDefinition } from "@/domain/ir";
import type { ComponentKind, ComponentRef } from "@/domain/references";

import type { ConfigContributionInput } from "../schemas";
import {
  isSchemaIssue,
  normalizeVerification,
  parseComponentRef,
  toHarnessEntries,
  toNameList,
} from "../schemas/common";
import { CODES, makeDiagnostic } from "../library/diagnostics";

export const SUPPORTED_CONFIG_VERSION = 1;

export interface ConfigLayer {
  readonly scope: string;
  readonly source: string;
  readonly value: ConfigContributionInput & { readonly version?: number };
}

const COMPONENT_FIELDS: ReadonlyArray<{
  field: "agents" | "skills" | "workflows" | "policies";
  kind: ComponentKind;
}> = [
  { field: "agents", kind: "agent" },
  { field: "skills", kind: "skill" },
  { field: "workflows", kind: "workflow" },
  { field: "policies", kind: "policy" },
];

/**
 * Apply the documented precedence chain. Layers are supplied in ascending
 * precedence order (defaults → global → packs → project → local); later layers
 * win. Lists merge by name and harnesses merge by id.
 */
export function mergeConfig(
  layers: readonly ConfigLayer[],
  diagnostics: Diagnostic[],
): ForjaConfig {
  let version = SUPPORTED_CONFIG_VERSION;
  let strict = false;
  let instructionFallback = false;
  let verification: VerificationDefinition = { fast: "", full: "" };
  const harnesses = new Map<string, boolean>();
  const refs = new Map<ComponentKind, Map<string, ComponentRef>>([
    ["skill", new Map()],
    ["agent", new Map()],
    ["workflow", new Map()],
    ["policy", new Map()],
  ]);

  for (const layer of layers) {
    if (layer.value.version !== undefined) {
      if (layer.value.version !== SUPPORTED_CONFIG_VERSION) {
        diagnostics.push(
          makeDiagnostic({
            code: CODES.unsupportedVersion,
            message: `unsupported config version ${layer.value.version}; expected ${SUPPORTED_CONFIG_VERSION}`,
            file: layer.source,
            field: "version",
          }),
        );
      } else {
        version = layer.value.version;
      }
    }

    if (layer.value.harnesses !== undefined) {
      for (const entry of toHarnessEntries(layer.value.harnesses)) {
        harnesses.set(entry.id, entry.enabled);
      }
    }

    if (layer.value.defaultHarnesses !== undefined) {
      for (const entry of toHarnessEntries(layer.value.defaultHarnesses)) {
        harnesses.set(entry.id, entry.enabled);
      }
    }

    for (const { field, kind } of COMPONENT_FIELDS) {
      const value = layer.value[field];
      if (value === undefined) continue;
      const bucket = refs.get(kind);
      if (!bucket) continue;
      for (const name of toNameList(value)) {
        const parsed = parseComponentRef(kind, name);
        if (isSchemaIssue(parsed)) {
          diagnostics.push(
            makeDiagnostic({
              code: CODES.invalidSchema,
              message: parsed.message,
              file: layer.source,
              field,
            }),
          );
          continue;
        }
        bucket.set(parsed.name, parsed);
      }
    }

    if (layer.value.verification !== undefined) {
      const normalized = normalizeVerification(layer.value.verification);
      if (isSchemaIssue(normalized)) {
        diagnostics.push(
          makeDiagnostic({
            code: CODES.conflictingVerification,
            message: normalized.message,
            file: layer.source,
            field: "verification",
          }),
        );
      } else {
        verification = {
          fast: normalized.value.fast || verification.fast,
          full: normalized.value.full || verification.full,
        };
      }
    }

    if (layer.value.compatibility?.strict !== undefined) {
      strict = layer.value.compatibility.strict;
    }
    if (layer.value.compatibility?.instructionFallback !== undefined) {
      instructionFallback = layer.value.compatibility.instructionFallback;
    }
  }

  const harnessEntries: HarnessEntry[] = [...harnesses.entries()]
    .map(([id, enabled]) => ({ id, enabled }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const sorted = (kind: ComponentKind): ComponentRef[] =>
    [...(refs.get(kind)?.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return {
    version,
    harnesses: harnessEntries,
    agents: sorted("agent"),
    skills: sorted("skill"),
    workflows: sorted("workflow"),
    policies: sorted("policy"),
    verification,
    strict,
    instructionFallback,
  };
}
