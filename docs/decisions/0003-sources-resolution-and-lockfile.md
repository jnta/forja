# ADR 0003 — Sources, resolution, cache and lockfile

- Status: accepted
- Date: 2026-10-14
- Phase: 3 (see [../implementation-plan.md](../implementation-plan.md))
- PRD references: sections 13, 15–17, 23, 29, 36–42

## Context

Phase 3 makes installations reproducible. It defines where packages come from,
how version constraints resolve, how content is cached and verified, and how
`forja.lock` pins a resolution. It deliberately does not add user-facing install
commands (that is Phase 8); the resolver is an application service with tested
trust gates.

## Decision

### 1. Source syntax (PRD 37)

| Syntax                                | Kind       | Notes                              |
| ------------------------------------- | ---------- | ---------------------------------- |
| `./path`, `/path`, `local:path`       | local      | Path used directly as a source root |
| `git:<url>[#selector]`                | git        | Cloned and checked out at a commit  |
| `github:owner/repo[/subpath][@sel]`   | git        | Expands to `https://github.com/...` |
| `registry:<name>` / `name`            | registry   | Looked up in a configured registry root |

A **source root** uses the Phase 2 library layout (`skills/`, `agents/`,
`workflows/`, `policies/`, `packs/`). `enumeratePackages` reuses the Phase 2
reader to list exported packages. Only skills and packs carry a declared version
(`skill.yaml:version`, `pack:version`); other kinds resolve by name and are
pinned by the containing source + commit.

### 2. Package identity and lockfile (PRD 15)

`forja.lock` is grouped by kind:

```yaml
lockfileVersion: 1
skills:
  testing:
    version: 2.4.1
    source: github:forja-sh/skills#abc123
    integrity: sha256-<hex>
    commit: abc123
    dependencies: [skill:code-review@1.0.0]
```

`integrity` is a deterministic `sha256-<hex>` digest of the package content
(sorted file paths + bytes). Symlinks are ignored, so a package cannot escape
its extraction root. Serialization and parsing are order-stable.

### 3. Resolution rules

- Candidates are gathered from all configured sources; the highest version
  satisfying the constraint wins, with source order as the tiebreaker.
- Pack dependencies and skill dependencies resolve transitively; the graph is
  checked for cycles.
- A component already resolved at a version that does not satisfy a later
  constraint produces `FORJA-PKG-001` (conflict).
- Missing packages produce `FORJA-PKG-002`; unreachable sources produce
  `FORJA-PKG-009`.

### 4. Modes

- **install**: resolve from sources, apply trust, store content in the cache and
  produce a lockfile.
- **locked**: use the locked versions and integrity; never silently upgrade. If
  content is not cached it is re-materialized at the locked commit and its
  integrity is verified (`FORJA-PKG-006` on mismatch).
- **offline**: require a lockfile and a complete cache; missing content is
  `FORJA-PKG-005`. Cached content is re-hashed, so a corrupt cache is detected.

### 5. Cache

`ContentCachePort` stores content under `<cacheRoot>/<integrity>`. The filesystem
implementation copies directories/files without following symlinks. Locked and
offline resolution read from the cache.

### 6. Trust (PRD 40–42)

Before installing, each package gets a `RiskSummary` (source, `scripts/` files,
remote references, unsigned). The trust policy (`scripts`, `remoteReferences`,
`unsignedPackages` = `ask` | `deny` | `allow`, default ask/ask/allow) decides:

- `deny` → the package is refused;
- `ask` without explicit consent → the resolution is rejected and reports
  `requiresConfirmation` (noninteractive callers fail closed);
- `allow` / explicit consent → installation proceeds.

Package scripts are **never executed**. On rejection the resolver writes no
cache entry and returns an empty lockfile; staging materialization is temporary.

### 7. Diagnostic codes (Phase 3)

| Code            | Meaning                                  |
| --------------- | ---------------------------------------- |
| `FORJA-PKG-001` | Conflicting dependency constraint        |
| `FORJA-PKG-002` | Missing version / package                |
| `FORJA-PKG-003` | No source can provide a locked package   |
| `FORJA-PKG-004` | Locked/offline mode without a lockfile   |
| `FORJA-PKG-005` | Offline cache miss                       |
| `FORJA-PKG-006` | Integrity/checksum mismatch              |
| `FORJA-PKG-007` | Untrusted package                        |
| `FORJA-PKG-008` | Source extraction-root escape            |
| `FORJA-PKG-009` | Unavailable source / network             |

## Consequences

- Phase 4 can consume resolved packages with verified integrity.
- Phase 8 (`add`/`remove`/`update`) builds on the resolver and the lockfile.
- A hosted registry is not required: registries are just source roots (local or
  Git-backed), and no default public URL is assumed.
- Limitation: only skills and packs are versioned today; agent/workflow/policy
  versions are recorded as `0.0.0` and pinned by source + commit.
