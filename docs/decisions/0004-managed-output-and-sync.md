# ADR 0004 — Managed output lifecycle and safe synchronization

- Status: accepted
- Date: 2026-10-14
- Phase: 4 (see [../implementation-plan.md](../implementation-plan.md))
- PRD references: sections 4.6–4.7, 20–22, 24, 31, 43–45, 88

## Context

Adapters must never write files directly. They produce a desired set of
artifacts; a shared planner and writer decide what to change, refuse unsafe
changes, and apply them transactionally. This is what makes `forja diff`,
`forja sync`, `forja sync --dry-run` and `forja sync --check` share one code
path and never destroy hand-authored configuration.

## Decision

### 1. Ownership state

Forja records ownership in `.forja/state.json`:

```json
{
  "version": 1,
  "managedFiles": {
    ".opencode/agents/reviewer.md": {
      "hash": "sha256-<hex>",
      "source": "agent:reviewer.md",
      "harness": "opencode"
    }
  }
}
```

`hash` is the digest of the content Forja last generated. Unknown ownership is
never permission to overwrite.

### 2. Planner (pure, no writes)

`planSync` takes the desired artifacts (absolute paths), the current filesystem
and the previous state, and produces a `SyncPlan` of entries
(`create`/`update`/`unchanged`/`delete`/`conflict`) plus conflicts. Rules:

- file missing → `create`;
- content equals desired → `unchanged`;
- content equals the recorded managed hash → safe `update`;
- content differs from the recorded hash → **conflict** (`modified-managed`);
- file exists without ownership → **conflict** (`unmanaged-collision`);
- a stale managed file is deleted only when it is still owned **and**
  unmodified; otherwise it is a `stale-modified` conflict;
- artifacts that resolve outside the project root are rejected
  (`FORJA-SYNC-007`).

**Overlapping adapters**: identical bytes at the same path are deduplicated
(harness/source merged); differing bytes are an `adapter-mismatch` conflict
(`FORJA-SYNC-005`) that blocks application.

### 3. Conflict handling (PRD 44)

`resolveConflicts` maps each conflict to `overwrite`, `keep` or `abort`:

- an explicit per-path choice wins;
- otherwise the scoped `--overwrite` / `--keep-local` flags apply;
- otherwise the run **aborts** (noninteractive fails closed).

`keep` preserves the file, records it as unresolved drift, and leaves the
previous managed hash so the drift is reported again next time. `overwrite`
requires an explicit selection. `diff` is handled by an interactive caller; the
noninteractive resolver treats it as abort.

### 4. Writer (transactional)

`applySync`:

1. acquires a directory lock (`.forja/sync.lock`); a concurrent run gets
   `FORJA-SYNC-003` and changes nothing;
2. writes files atomically (temp file + rename) and backs up every touched file
   (including the state file) in memory;
3. removes stale files and finally commits `.forja/state.json`;
4. on any failure, restores every backup (or removes files it created), releases
   the lock, and reports `FORJA-SYNC-004` — manual content is never lost.

### 5. Commands and exit codes

- `forja diff` and `forja sync --dry-run` never write.
- `forja sync --check` exits with the documented drift code **5**
  (`ExitCode.Drift`) when changes are required, so CI can gate reproducibility.
- `forja sync` exits 4 on unresolved conflicts.

The first version wires only the configured adapters (none until Phase 5), so
`diff`/`sync` report "No changes" until a real adapter is registered.

### 6. Diagnostic codes (Phase 4)

| Code            | Meaning                                    |
| --------------- | ------------------------------------------ |
| `FORJA-SYNC-001` | Conflict detected                          |
| `FORJA-SYNC-002` | Run aborted (unresolved conflict)          |
| `FORJA-SYNC-003` | Concurrent sync (lock held)                |
| `FORJA-SYNC-004` | Failure rolled back                        |
| `FORJA-SYNC-005` | Adapters disagree on the same path         |
| `FORJA-SYNC-006` | Unresolved drift                           |
| `FORJA-SYNC-007` | Artifact path escapes the project          |
| `FORJA-SYNC-008` | Invalid state manifest                     |

## Consequences

- Phase 5/6 adapters only need to return artifacts; safety is centralized.
- Running `forja sync` twice with no input changes produces no diff (PRD 4.7).
- Recovery and concurrency behavior is covered by tests with injected failures
  and a held lock.
