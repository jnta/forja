# ADR 0007 — Initialization, global/project scope and doctor

- Status: accepted
- Date: 2026-10-15
- Phase: 7 (see [../implementation-plan.md](../implementation-plan.md))
- PRD references: sections 16–19, 23, 27–28, 49–50, 75

## Decision

### 1. Project vs global scope

`resolveScope` maps a scope to library roots and an output root:

| Scope | Library roots | Output root |
| ----- | ------------- | ----------- |
| project | `{ projectDir, globalDir }` | `projectDir` |
| global | `{ globalDir, globalDir }` | `homeDir` |

Global scope loads only the personal library and writes native global
configuration under the user's home (`shared/locations.ts`):

| Harness | Global skills | Global agents | Global instructions |
| ------- | ------------- | ------------- | ------------------- |
| OpenCode | `~/.agents/skills` | `~/.config/opencode/agents` | `~/.config/opencode/AGENTS.md` |
| Claude Code | `~/.claude/skills` | `~/.claude/agents` | `~/.claude/CLAUDE.md` |
| Codex | `~/.agents/skills` | `~/.codex/agents` | `~/.codex/AGENTS.md` |

`--global` enables this on `init`, `validate`, `list`, `config`, `diff`, `sync`
and `doctor`. Project scope is unchanged. Global sync state lives in
`~/.forja/state.json`; project sync state lives in `<project>/.forja/state.json`.

`FORJA_HOME` overrides the global library root; the harness home is the OS home
(overridable via `HOME` in tests).

### 2. `forja init` (PRD 19, 75)

- Project scope writes `forja.yaml` (version, harnesses, optional packs,
  verification) and ensures `.gitignore` contains `forja.local.yaml`.
- Global scope writes `~/.forja/config.yaml` (`defaultHarnesses`, verification).
- Safe on repeat: an existing file is preserved unless `--force` is passed.
- Noninteractive (`--yes` or no TTY) never prompts and never hangs; interactive
  mode uses `@clack/prompts` and cancels without writing anything.
- Stack discovery (`discoverStack`) detects Maven/Gradle, Node/TypeScript,
  Python, Go and Rust from marker files and **suggests** packs; it never
  installs them.
- Verification values are stored as strings; Forja never runs them.

### 3. `forja doctor` (PRD 28)

Read-only checks grouped as environment (Node version, Git, writable home),
harnesses (detection), configuration (validation), compatibility
(`FORJA-COMPAT-*`) and generated state (dry-run drift). Doctor performs **no
repair**: it only inspects and reports, exiting non-zero on errors.

### 4. `forja config`

Prints the effective merged configuration for the selected scope (harnesses,
component references, verification, strict/instruction fallback) plus any
diagnostics, making the precedence chain observable.

## Consequences

- A developer can set up a personal library once (`forja init --global`) and
  apply it in any repository.
- Project and global configuration are independent; project overrides never
  mutate global definitions (loading is read-only and merging is in-memory).
- Doctor and `config` give scriptable (`--json`) insight without side effects.
- Limitation: interactive prompts are exercised manually; automated tests cover
  the noninteractive paths.
