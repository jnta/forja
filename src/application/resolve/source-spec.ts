import type { SourceSpec } from "@/domain/package-source";

export type SourceSpecResult =
  | { readonly ok: true; readonly spec: SourceSpec }
  | { readonly ok: false; readonly message: string };

const GITHUB = /^github:([^/]+)\/([^/@#]+)(?:\/([^@#]+))?(?:[#@](.+))?$/;
const GIT = /^git:(.+?)(?:#(.+))?$/;
const LOCAL_PREFIX = /^local:(.+)$/;
const REGISTRY_PREFIX = /^registry:(.+)$/;

/**
 * Parse a source string (PRD 37):
 *   `./path` / `/path` / `local:path`   → local
 *   `git:<url>[#selector]`              → git
 *   `github:owner/repo[/subpath][@sel]` → git
 *   `registry:<name>` / `name`          → registry
 */
export function parseSourceSpec(raw: string): SourceSpecResult {
  const value = raw.trim();
  if (value.length === 0) {
    return { ok: false, message: "empty source reference" };
  }

  const local = LOCAL_PREFIX.exec(value);
  if (local) {
    return { ok: true, spec: { kind: "local", location: local[1], raw: value } };
  }
  if (value.startsWith("./") || value.startsWith("../") || value.startsWith("/")) {
    return { ok: true, spec: { kind: "local", location: value, raw: value } };
  }

  const github = GITHUB.exec(value);
  if (github) {
    const [, owner, repo, subpath, selector] = github;
    return {
      ok: true,
      spec: {
        kind: "git",
        location: `https://github.com/${owner}/${repo}.git`,
        subpath,
        selector,
        raw: value,
      },
    };
  }

  const git = GIT.exec(value);
  if (git) {
    return {
      ok: true,
      spec: { kind: "git", location: git[1], selector: git[2], raw: value },
    };
  }

  const registry = REGISTRY_PREFIX.exec(value);
  if (registry) {
    return { ok: true, spec: { kind: "registry", location: registry[1], raw: value } };
  }

  if (/^[a-z][a-z0-9-]*$/.test(value)) {
    return { ok: true, spec: { kind: "registry", location: value, raw: value } };
  }

  return { ok: false, message: `unrecognized source "${value}"` };
}

/** Canonical source string recorded in the lockfile. */
export function formatSource(spec: SourceSpec, commit?: string): string {
  if (spec.kind === "local") return `local:${spec.location}`;
  if (spec.kind === "registry") return `registry:${spec.location}`;

  let base = spec.raw;
  if (
    spec.selector &&
    (base.endsWith(`@${spec.selector}`) || base.endsWith(`#${spec.selector}`))
  ) {
    base = base.slice(0, base.length - spec.selector.length - 1);
  }
  return commit ? `${base}#${commit}` : base;
}
