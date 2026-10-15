import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Architectural guard for the layered (ports & adapters) architecture described
 * in AGENTS.md and docs/decisions/0001-cli-foundation.md.
 *
 * Dependencies point inward only:
 *   app / cli  ->  application  ->  domain
 *   infrastructure  ->  domain
 * Composition roots are the single exception allowed to import infrastructure.
 */
const srcRoot = fileURLToPath(new URL(".", import.meta.url));

const LAYERS = ["domain", "application", "infrastructure", "app", "cli"] as const;
type Layer = (typeof LAYERS)[number];

const COMPOSITION_ROOTS = new Set(["container.ts", "cli/container.ts"]);

const FORBIDDEN_CLI_IMPORTS: readonly RegExp[] = [
  /^@langchain\//,
  /^langchain(\/|$)/,
  /^next(\/|$)/,
  /^react(\/|$)/,
  /^react-dom(\/|$)/,
  /^@opencode-ai\//,
];

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test" || entry.name === "node_modules") continue;
      files.push(...walk(full));
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      files.push(full);
    }
  }
  return files;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g;
  for (const match of stripComments(source).matchAll(pattern)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function relativeFromSrc(file: string): string {
  return path.relative(srcRoot, file).split(path.sep).join("/");
}

function layerOf(relFromSrc: string): Layer | "other" {
  const first = relFromSrc.split("/")[0];
  return (LAYERS as readonly string[]).includes(first)
    ? (first as Layer)
    : "other";
}

function resolveTarget(
  file: string,
  specifier: string,
): { kind: "external" } | { kind: "file"; relFromSrc: string } {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const absolute = path.resolve(path.dirname(file), specifier);
    return { kind: "file", relFromSrc: relativeFromSrc(absolute) };
  }
  if (specifier.startsWith("@/")) {
    return { kind: "file", relFromSrc: specifier.slice(2) };
  }
  return { kind: "external" };
}

interface Violation {
  readonly file: string;
  readonly specifier: string;
  readonly reason: string;
}

function checkFile(file: string): Violation[] {
  const relFromSrc = relativeFromSrc(file);
  const layer = layerOf(relFromSrc);
  const isCompositionRoot = COMPOSITION_ROOTS.has(relFromSrc);
  const violations: Violation[] = [];

  for (const specifier of importsOf(readFileSync(file, "utf8"))) {
    const target = resolveTarget(file, specifier);
    const targetLayer = target.kind === "file" ? layerOf(target.relFromSrc) : null;

    if (layer === "domain") {
      if (target.kind === "external") {
        violations.push({
          file: relFromSrc,
          specifier,
          reason: "domain must not import third-party packages",
        });
      } else if (targetLayer !== "domain") {
        violations.push({
          file: relFromSrc,
          specifier,
          reason: `domain may only import domain, not ${targetLayer}`,
        });
      }
      continue;
    }

    if (layer === "application" && (targetLayer === "infrastructure" || targetLayer === "app" || targetLayer === "cli")) {
      violations.push({ file: relFromSrc, specifier, reason: `application must not import ${targetLayer}` });
    }

    if (layer === "infrastructure" && (targetLayer === "application" || targetLayer === "app" || targetLayer === "cli")) {
      violations.push({ file: relFromSrc, specifier, reason: `infrastructure must not import ${targetLayer}` });
    }

    if (layer === "app" || layer === "cli") {
      const opposite = layer === "app" ? "cli" : "app";
      if (targetLayer === opposite) {
        violations.push({ file: relFromSrc, specifier, reason: `${layer} must not import ${opposite}` });
      }
      if (
        target.kind === "file" &&
        targetLayer === "infrastructure" &&
        !isCompositionRoot
      ) {
        violations.push({
          file: relFromSrc,
          specifier,
          reason: `${layer} may import infrastructure only in a composition root`,
        });
      }
      if (layer === "cli" && target.kind === "file" && target.relFromSrc === "container.ts") {
        violations.push({
          file: relFromSrc,
          specifier,
          reason: "cli must not depend on the web composition root",
        });
      }
    }

    if (layer === "cli" && target.kind === "external") {
      if (FORBIDDEN_CLI_IMPORTS.some((pattern) => pattern.test(specifier))) {
        violations.push({
          file: relFromSrc,
          specifier,
          reason: "cli must not load the runtime/LLM stack",
        });
      }
    }
  }

  return violations;
}

describe("layer boundaries", () => {
  it("keeps dependencies pointing inward", () => {
    const files = walk(srcRoot);
    const violations = files.flatMap(checkFile);

    expect(
      violations.map((v) => `${v.file} -> ${v.specifier} (${v.reason})`),
    ).toEqual([]);
  });

  it("never lets the CLI load the runtime or LLM stack", () => {
    const cliFiles = walk(path.join(srcRoot, "cli"));
    const offenders = cliFiles.flatMap((file) =>
      importsOf(readFileSync(file, "utf8"))
        .filter((specifier) =>
          FORBIDDEN_CLI_IMPORTS.some((pattern) => pattern.test(specifier)),
        )
        .map((specifier) => `${relativeFromSrc(file)} -> ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });
});
