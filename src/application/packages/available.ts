import type { FilesystemPort } from "@/domain/filesystem";
import type { SourcePackage } from "@/domain/package-source";
import type { YamlParserPort } from "@/domain/serialization";

import { enumeratePackages, packageKey } from "../resolve/enumerate";
import type { SourceBinding } from "../resolve/resolver";

export interface AvailableDeps {
  readonly filesystem: FilesystemPort;
  readonly yaml: YamlParserPort;
  readonly stagingRoot: string;
}

export interface AvailablePackages {
  readonly packages: ReadonlyMap<string, readonly SourcePackage[]>;
  /** Sources that could not be reached (metadata unavailable). */
  readonly unavailable: readonly string[];
}

/** Enumerate every package offered by the configured sources. */
export async function collectAvailable(
  deps: AvailableDeps,
  bindings: readonly SourceBinding[],
): Promise<AvailablePackages> {
  const packages = new Map<string, SourcePackage[]>();
  const unavailable: string[] = [];

  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    const destination = deps.filesystem.resolve(deps.stagingRoot, `available-${index}`);
    await deps.filesystem.remove(destination, { recursive: true, force: true });
    await deps.filesystem.mkdir(destination, { recursive: true });

    try {
      const materialized = await binding.port.materialize(binding.spec, destination);
      if (!(await deps.filesystem.exists(materialized.directory))) {
        unavailable.push(binding.spec.raw);
        continue;
      }
      const { packages: found } = await enumeratePackages(
        { filesystem: deps.filesystem, yaml: deps.yaml },
        materialized.directory,
      );
      for (const pkg of found) {
        const key = packageKey(pkg.kind, pkg.name);
        const bucket = packages.get(key);
        if (bucket) bucket.push(pkg);
        else packages.set(key, [pkg]);
      }
    } catch {
      unavailable.push(binding.spec.raw);
    }
  }

  return { packages, unavailable };
}
