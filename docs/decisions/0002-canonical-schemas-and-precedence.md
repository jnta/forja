# ADR 0002 — Canonical schemas, library layout and configuration precedence

- Status: accepted
- Date: 2026-10-14
- Phase: 2 (see [../implementation-plan.md](../implementation-plan.md))
- PRD references: sections 8–17, 29, 33, 59–60, 69–71

## Context

Phase 2 introduces the canonical component schemas, the local library reader and
the configuration precedence chain that every later phase depends on (resolver,
sync planner, adapters). This ADR fixes the on-disk layout, the accepted input
shapes, the merge rules and the safety guarantees so Phases 3–11 do not need to
rewrite the IR.

## Decision

### 1. Library layout

The reader understands two scopes, both using the same layout:

| Scope   | Root                                  | Configuration file        |
| ------- | ------------------------------------- | ------------------------- |
| global  | `$FORJA_HOME` (default `~/.forja`)    | `<root>/config.yaml`      |
| project | `<projectDir>/.forja`                 | `<projectDir>/forja.yaml` |

`<projectDir>/forja.local.yaml` is the uncommitted local override and is **never**
written into the global root. `forja.local.yaml` must be listed in `.gitignore`;
`appendGitIgnoreEntries` / `missingGitIgnoreEntries` provide the entry and
`LOCAL_CONFIG_IGNORE_ENTRY` names it.

Within a root:

```text
<root>/
├── config.yaml                (global scope only)
├── skills/<id>/SKILL.md       (+ optional skill.yaml, references/, scripts/, assets/)
├── agents/<id>/AGENT.md       (+ agent.yaml)
├── workflows/<id>.yaml
├── policies/<id>.yaml
└── packs/<id>.yaml
```

Component ids are lowercase kebab-case and must match the directory/file name.

### 2. Canonical schemas

- **Skill** — `SKILL.md` requires frontmatter with `name` and `description`; the
  body is the instructions. Optional `skill.yaml`: `version` (semver), `category`,
  `tags`, `compatibility` (harness → range), `dependencies` (list or map),
  `resources` (relative paths; otherwise discovered under `references/`,
  `scripts/`, `assets/`).
- **Agent** — `agent.yaml` requires `type` (`primary` | `subagent`) and
  `capabilities` (`filesystem.read/write`, `shell`, optional `network`);
  `skills` is a list or map of skill references. `AGENT.md` provides the
  instructions (optional frontmatter for `description`). `shell` accepts either
  the string `none`/`readonly`/`full` or `{ enabled, mutating }` and normalizes
  to the IR `ShellAccess`.
- **Workflow** — `name`, optional `description`, `steps` as strings or
  `{ id, description }` objects.
- **Policy** — optional `verification`, `rules` (list of strings).
- **Pack** — `version` (semver, required), optional `description`, dependency
  lists/maps (`skills`, `agents`, `workflows`, `policies`, `packs`) and an
  optional `config` contribution.
- **Config** — optional `version` (must be `1`), `harnesses`/`defaultHarnesses`,
  `agents`/`skills`/`workflows`/`policies`, `verification` and
  `compatibility.strict`.

References are written `name@range` (`testing@^2`); `name` alone means any
version. Ranges are validated with `semver.validRange`.

### 3. Precedence and merge rules

Configuration is merged in this order (later wins):

```text
defaults → global config → global policy verification → packs → project config
        → project policy verification → forja.local.yaml
```

- **harnesses**: merged by id; a later layer overrides `enabled`.
- **component lists** (`agents`/`skills`/`workflows`/`policies`): merged by name;
  a later layer overrides the version range.
- **verification**: merged per slot (`fast`/`full`); a non-empty later value
  overrides, an empty value does not clear it.
- **compatibility.strict**: last defined value wins.

Definitions are merged with project overriding global by id. Merging is purely
in-memory: loading never writes to either scope, so project/local overrides can
never mutate global files (proved by a read-only filesystem test).

### 4. Alias normalization

- Harnesses: list `["opencode"]` or map `{ opencode: { enabled: true } }`.
- Dependencies: list `["testing@^2"]` or map `{ testing: "^2" }`.
- Verification slots: `fast` / `check` / `quick` (fast) and `full` / `verify`
  (full); each value is a string or `{ command: "..." }`. Conflicting aliases of
  the same slot produce `FORJA-CFG-011` instead of silently picking one.

### 5. Safety and determinism

- Verification commands are stored as opaque strings and never executed during
  validation or loading (proved by a fixture whose command would create a file).
- Declared resources must be relative and may not contain `..`; every resource is
  `realpath`-checked to stay inside its skill directory, so symlink escapes fail.
- All output collections are sorted (components by id, tags and rules
  alphabetically, harnesses by id), so identical inputs produce identical IR.
- Loading returns structured diagnostics with file/field/line locations instead
  of throwing; only genuine I/O failures surface as `ForjaError`.

### 6. Diagnostic codes (Phase 2)

| Code          | Meaning                                        |
| ------------- | ---------------------------------------------- |
| `FORJA-CFG-001` | Invalid YAML                                  |
| `FORJA-CFG-002` | Invalid schema / reference / version          |
| `FORJA-CFG-003` | Invalid or missing Markdown frontmatter       |
| `FORJA-CFG-004` | Missing file (entry, manifest, resource)      |
| `FORJA-CFG-005` | Duplicate id or duplicate reference           |
| `FORJA-CFG-006` | Invalid or mismatched component name          |
| `FORJA-CFG-007` | Missing reference                             |
| `FORJA-CFG-008` | Dependency cycle                              |
| `FORJA-CFG-009` | Unsafe path or symlink escape                 |
| `FORJA-CFG-011` | Conflicting verification aliases              |
| `FORJA-CFG-012` | Configured component not installed (warning)  |
| `FORJA-CFG-013` | Unsupported config version                    |

## Consequences

- `forja validate` and `forja list` operate on global + project libraries and
  never write.
- The resolver (Phase 3) can consume `ComponentRef`s directly; the sync planner
  (Phase 4) can consume the deterministic IR.
- The `packs` precedence layer is wired now, so Phase 3 only has to materialize
  remote pack content.
