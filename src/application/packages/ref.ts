import path from "node:path";

import type { FilesystemPort } from "@/domain/filesystem";
import type { ResolvedPackage } from "../resolve/resolver";
import type { ComponentKind } from "@/domain/references";
import { formatSource, parseSourceSpec } from "../resolve/source-spec";

const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const KIND_CONFIG_KEY: Record<ComponentKind, string> = {
  skill: "skills",
  agent: "agents",
  workflow: "workflows",
  policy: "policies",
  pack: "packs",
};

export interface ParsedAdd {
  readonly kind: ComponentKind;
  readonly name: string;
  readonly range?: string;
  /** Canonical source string, when the input pointed at a source. */
  readonly source?: string;
}

export type ParseAddResult =
  | { readonly ok: true; readonly value: ParsedAdd }
  | { readonly ok: false; readonly message: string };

function isSourceInput(input: string): boolean {
  return (
    input.startsWith("github:") ||
    input.startsWith("git:") ||
    input.startsWith("local:") ||
    input.startsWith("./") ||
    input.startsWith("../") ||
    input.startsWith("/")
  );
}

/** Parse an `add` argument: `testing`, `testing@^2`, `github:o/r/testing`. */
export function parseAddRef(
  input: string,
  kind: ComponentKind = "skill",
): ParseAddResult {
  const value = input.trim();
  if (value.length === 0) return { ok: false, message: "empty package reference" };

  if (isSourceInput(value)) {
    const parsed = parseSourceSpec(value);
    if (!parsed.ok) return { ok: false, message: parsed.message };
    const spec = parsed.spec;
    const name = spec.subpath
      ? spec.subpath.split("/").filter(Boolean).pop() ?? ""
      : path.basename(spec.location).replace(/\.git$/, "");
    if (!NAME_PATTERN.test(name)) {
      return { ok: false, message: `cannot derive a package name from "${value}"` };
    }
    return {
      ok: true,
      value: { kind, name, range: spec.selector, source: formatSource(spec) },
    };
  }

  const at = value.indexOf("@");
  const name = at === -1 ? value : value.slice(0, at);
  const range = at === -1 ? undefined : value.slice(at + 1);
  if (!NAME_PATTERN.test(name)) {
    return { ok: false, message: `invalid package name "${name}"` };
  }
  if (at !== -1 && range!.length === 0) {
    return { ok: false, message: `missing version range in "${value}"` };
  }
  return { ok: true, value: { kind, name, range } };
}

export function formatRef(name: string, range?: string): string {
  return range ? `${name}@${range}` : name;
}

/** Absolute path where a resolved package is installed in a library root. */
export function installedPath(
  root: string,
  kind: ComponentKind,
  name: string,
): string {
  switch (kind) {
    case "skill":
      return path.join(root, "skills", name);
    case "agent":
      return path.join(root, "agents", name);
    case "workflow":
      return path.join(root, "workflows", `${name}.yaml`);
    case "policy":
      return path.join(root, "policies", `${name}.yaml`);
    case "pack":
      return path.join(root, "packs", `${name}.yaml`);
  }
}

export async function installPackage(
  filesystem: FilesystemPort,
  root: string,
  pkg: Pick<ResolvedPackage, "kind" | "name" | "directory">,
): Promise<string> {
  const target = installedPath(root, pkg.kind, pkg.name);
  await filesystem.remove(target, { recursive: true, force: true });
  await filesystem.mkdir(path.dirname(target), { recursive: true });
  await filesystem.copy(pkg.directory, target);
  return target;
}

export async function uninstallPackage(
  filesystem: FilesystemPort,
  root: string,
  kind: ComponentKind,
  name: string,
): Promise<void> {
  await filesystem.remove(installedPath(root, kind, name), {
    recursive: true,
    force: true,
  });
}
