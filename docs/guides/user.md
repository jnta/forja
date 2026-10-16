# Forja user guide

Forja defines your AI engineering workflow once and generates configuration for
OpenCode, Claude Code and Codex.

## Install

```bash
npm install -g @forja/cli   # or: npx @forja/cli
forja --version
```

Node.js 22 or newer is required.

## First steps

```bash
forja init            # create forja.yaml (+ .gitignore entry)
forja add pack core-engineering
forja validate
forja diff            # preview generated changes
forja sync            # write harness configuration
```

- `forja init --global` sets up a personal library in `~/.forja`.
- `--global` works on `init`, `validate`, `list`, `config`, `add`, `remove`,
  `outdated`, `update`, `diff`, `sync` and `doctor`.
- `forja sync --check` exits non-zero when committed output is out of date (CI).

## Everyday commands

| Command | Purpose |
| ------- | ------- |
| `forja validate` | Validate configuration and definitions |
| `forja list` | List harnesses and components |
| `forja config` | Show the effective merged configuration |
| `forja diff` | Show generated changes without writing |
| `forja sync` | Generate harness configuration |
| `forja add <ref>` | Add a skill/agent/workflow/policy/pack |
| `forja remove <name>` | Remove a package (prunes unreferenced content) |
| `forja outdated` | Report current/wanted/latest versions |
| `forja update [name]` | Update within configured ranges |
| `forja harness list\|enable\|disable\|info` | Manage harnesses |
| `forja doctor` | Diagnose environment, configuration and compatibility |

Global flags: `--quiet`, `--verbose`, `--debug` (verbosity) and `--json`
(machine-readable output on most commands). Add `--global` to target the
personal library.

## Where files live

```text
forja.yaml            project configuration
forja.lock            reproducible package lock
forja.local.yaml      uncommitted local overrides (git-ignored)
.forja/               project library: skills, agents, workflows, policies, packs, state
~/.forja/             global library (FORJA_HOME overrides)
```

Generated harness output (project scope): `.agents/skills/`, `.opencode/agents/`,
`.claude/agents/`, `.codex/agents/`, and a managed block in `AGENTS.md` /
`CLAUDE.md`. Forja never rewrites `opencode.json`, `settings.json` or
`config.toml`.

## Safety

- Generated files are tracked with checksums; edited files become conflicts
  instead of being overwritten.
- `diff`/`--dry-run` never write; `--check` reports drift.
- Manual content in shared instruction files is preserved.
- Package scripts are never executed; credential references never copy secrets.
- Telemetry is disabled.
