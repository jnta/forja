# Forja documentation

- [Product requirements](prd.md) — preserved draft covering product scope, functionality, technologies and long-term vision.
- [Phased implementation plan](implementation-plan.md) — sequential scope, deliverables, implementation order and test gates, adapted to the existing repository.
- [Decisions](decisions/0001-cli-foundation.md) — architecture decision records: CLI foundation; [canonical schemas and precedence](decisions/0002-canonical-schemas-and-precedence.md); [sources, resolution and lockfile](decisions/0003-sources-resolution-and-lockfile.md); [managed output and sync](decisions/0004-managed-output-and-sync.md); [OpenCode adapter](decisions/0005-opencode-adapter.md); [Claude Code and Codex adapters](decisions/0006-claude-and-codex-adapters.md); [init, scope and doctor](decisions/0007-init-scope-and-doctor.md); [package lifecycle](decisions/0008-package-lifecycle.md); [extensions and catalog](decisions/0009-extensions-and-catalog.md).
- [Adapter authoring guide](adapters/authoring.md) — how to write and register a harness adapter.
- [User guide](guides/user.md) and [troubleshooting/recovery](guides/troubleshooting.md).
- [Compatibility matrix](compatibility.md) and [requirement traceability](traceability.md).

Start with Phase 1 and complete its acceptance gate before moving forward. Phases 1–10 target v1; later phases cover authoring and ecosystem expansion.
