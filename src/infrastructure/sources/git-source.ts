import path from "node:path";

import { execa } from "execa";

import { ForjaError } from "@/domain/errors";
import type {
  MaterializedSource,
  PackageSourcePort,
  SourceSpec,
} from "@/domain/package-source";

function resolveSubpath(destination: string, subpath: string): string {
  const resolved = path.resolve(destination, subpath);
  if (resolved !== destination && !resolved.startsWith(`${destination}${path.sep}`)) {
    throw new ForjaError(
      `git subpath "${subpath}" escapes the extraction root`,
      "FORJA-PKG-008",
      { kind: "config" },
    );
  }
  return resolved;
}

/** Clones a Git source at an immutable commit (PRD 37, 39). */
export class GitSource implements PackageSourcePort {
  readonly kind = "git" as const;

  canResolve(spec: SourceSpec): boolean {
    return spec.kind === "git";
  }

  async materialize(
    spec: SourceSpec,
    destination: string,
  ): Promise<MaterializedSource> {
    const root = spec.subpath
      ? resolveSubpath(destination, spec.subpath)
      : destination;
    await execa("git", ["clone", "--quiet", spec.location, destination]);
    if (spec.selector) {
      await execa("git", ["-C", destination, "checkout", "--quiet", spec.selector]);
    }
    const { stdout } = await execa("git", ["-C", destination, "rev-parse", "HEAD"]);
    const commit = stdout.trim();
    return { directory: root, commit, source: `${spec.raw}#${commit}` };
  }
}
