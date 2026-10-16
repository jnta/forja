# ADR 0008 — Package lifecycle and updates

- Status: accepted
- Date: 2026-10-15
- Phase: 8 (see [../implementation-plan.md](../implementation-plan.md))
- PRD references: sections 13, 23–27, 29, 36–42

## Decision

### 1. Installed content

`forja add` materializes resolved packages into the library root:

| Scope | Library root | Config | Lock |
| ----- | ------------ | ------ | ---- |
| project | `<project>/.forja` | `forja.yaml` | `forja.lock` |
| global | `~/.forja` | `~/.forja/config.yaml` | `~/.forja/forja.lock` |

Components are installed at the canonical Phase 2 locations
(`skills/<id>/`, `agents/<id>/`, `workflows/<id>.yaml`, `policies/<id>.yaml`,
`packs/<id>.yaml`). `forja.lock` records version, source, integrity and the
transitive dependency edges used for pruning.

Sources come from the config `sources` list (local roots and Git URLs);
`createSources` (composition root) turns them into `SourceBinding`s. A source
reference on `add` (e.g. `github:owner/repo/testing`) is added to `sources`
automatically.

### 2. `add` (PRD 23)

Accepts `add [kind] <ref>`: shorthand (`add testing` → skill), versioned
(`testing@^2`), explicit kind (`add pack core`) and source references. The
operation is **transactional by ordering**: resolution and the trust gate run
before any write, so an unavailable source, a checksum failure or a rejected
package leaves the manifest, lock, installed content and managed outputs
untouched. On success it installs content, merges the lock and runs a safe sync.

### 3. `remove` (PRD 24)

Removes the reference, then prunes only installed packages that are no longer
reachable from the remaining configuration, expanding through lock dependency
edges (so a skill still required by a pack is retained). Local definitions that
are not in the lock are never touched, and manual files outside installed
packages are preserved.

### 4. `outdated` (PRD 26)

Reports `current` (locked), `wanted` (highest version satisfying the configured
range) and `latest` (highest available). A source that cannot be reached yields
`unavailableSources`, and a package with no metadata is reported as
`unavailable` — distinct from `up-to-date`.

### 5. `update` (PRD 25)

Upgrades installed packages to `wanted`. Exact version pins are protected (never
upgraded), and a newer major beyond the range is reported as
`major update skipped` without changing anything. `--dry-run` previews and
writes nothing. A `[name]` argument and `--kind` select targets. Updates resolve
and install before rewriting the lock, so failures stay consistent, then run a
safe sync.

### 6. Failure consistency

Resolution/trust precede writes; install failures surface before the lock is
written; managed-output conflicts are handled by the transactional sync writer
(Phase 4). Removing a harness or package prunes only owned, unmodified generated
artifacts.

## Consequences

- The full lifecycle (`add`/`remove`/`outdated`/`update`/`list`) works in project
  and global scope.
- `forja.lock` is the source of truth for installed remote packages; local
  definitions remain unmanaged by the lock.
- Limitation: `add <local path>` expects a source root (registry-style layout);
  a single component directory is not detected yet. Packs are referenced by
  name; resolution uses the configured ranges.
