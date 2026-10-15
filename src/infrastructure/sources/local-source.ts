import type { FilesystemPort } from "@/domain/filesystem";
import type {
  MaterializedSource,
  PackageSourcePort,
  SourceSpec,
} from "@/domain/package-source";

/** Resolves `local:<path>` and bare filesystem paths. */
export class LocalSource implements PackageSourcePort {
  readonly kind = "local" as const;

  constructor(private readonly filesystem: FilesystemPort) {}

  canResolve(spec: SourceSpec): boolean {
    return spec.kind === "local";
  }

  async materialize(spec: SourceSpec): Promise<MaterializedSource> {
    return {
      directory: this.filesystem.resolve(spec.location),
      source: `local:${spec.location}`,
    };
  }
}
