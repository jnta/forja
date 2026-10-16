# Troubleshooting and recovery

## Diagnostics

Run `forja doctor` (add `--global` for the personal library, `--json` for
machine output). It reports environment (Node, Git, writable home, telemetry),
harness detection, configuration validity, compatibility and generated-file
drift. Doctor never repairs anything.

## Common issues

| Symptom | Meaning | Fix |
| ------- | ------- | --- |
| `sync --check` exits 5 | Generated output is out of date | Run `forja sync` and commit the result |
| `sync` exits 4 | Unresolved conflict | Inspect with `forja diff`, then `--overwrite` or `--keep-local` |
| `FORJA-COMPAT-002` | Unsupported agent semantics | Use a different harness, or enable `compatibility.instructionFallback` |
| `FORJA-COMPAT-001` | Degraded capability | Review the generated configuration (e.g. read-only shell becomes no shell) |
| `FORJA-PKG-005` | Offline cache miss | Run once online, or drop `--offline` |
| `FORJA-PKG-006` | Integrity mismatch | Review the source, then `forja update` to relock |
| `FORJA-CFG-012` | Configured component not installed | `forja add` it, or remove it from `forja.yaml` |

## Conflicts

Forja only overwrites a generated file when its current hash matches the last
generated hash. Otherwise it reports a conflict and aborts unless you choose:

```bash
forja sync --overwrite     # replace conflicting managed files
forja sync --keep-local    # keep your edits, report unresolved drift
```

`--keep-local` preserves the file and keeps reporting drift until resolved.

## Recovery

- Sync is transactional: on failure every touched file (and the state manifest)
  is restored; the lock is released and nothing is left half-written.
- `forja sync` is idempotent — running it twice with no input changes produces
  no diff.
- To rebuild from scratch: keep `forja.yaml`/`forja.lock`, delete generated
  harness files and `.forja/state.json`, then run `forja sync`.
- A held lock (`.forja/sync.lock`) means another sync is running; wait for it to
  finish. Remove it only if you are sure no sync is active.

## Upgrade

1. `npm install -g @forja/cli@latest`
2. `forja doctor` — confirm environment and harness detection.
3. `forja validate` — check configuration against the new version.
4. `forja diff` then `forja sync` — apply any format changes.
5. `forja sync --check` — confirm reproducibility in CI.

The lockfile format and sync state are versioned; an unsupported version is
reported clearly rather than migrated silently.
