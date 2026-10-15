import type {
  MaterializedSource,
  PackageSourcePort,
  SourceSpec,
} from "@/domain/package-source";

/**
 * A registry is a source root looked up by package name (PRD 36). The root may
 * itself be a local directory or a checkout; the resolver enumerates packages
 * from it exactly like any other source.
 */
export class RegistrySource implements PackageSourcePort {
  readonly kind = "registry" as const;

  constructor(private readonly root: string) {}

  canResolve(spec: SourceSpec): boolean {
    return spec.kind === "registry";
  }

  async materialize(): Promise<MaterializedSource> {
    return { directory: this.root, source: `registry:${this.root}` };
  }
}
