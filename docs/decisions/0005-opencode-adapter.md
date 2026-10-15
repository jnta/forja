# ADR 0005 — OpenCode portability adapter

- Status: accepted
- Date: 2026-10-15
- Phase: 5 (see [../implementation-plan.md](../implementation-plan.md))
- PRD references: sections 20, 31–32, 34, 43–45, 69–70

## Tested native format

- Installed harness: **OpenCode v2.0.28** (`opencode --version`), Linux x64.
- Official documentation consulted on 2026-10-15:
  `https://opencode.ai/docs/agents/`, `.../skills/`, `.../rules/`.

Supported surfaces:

| Surface     | Location                               | Notes |
| ----------- | -------------------------------------- | ----- |
| Skills      | `.agents/skills/<id>/SKILL.md`         | Also discovered at `.opencode/skills` and `.claude/skills`; the portable `.agents` location is shared with Codex (Phase 6) |
| Agents      | `.opencode/agents/<id>.md`             | Markdown frontmatter: `description` (required), `mode`, `permission`, plus extensions |
| Instructions| `AGENTS.md` (project root)             | Managed block inside a user-authored file |

`opencode.json` is **never generated**: OpenCode agents can live entirely as
Markdown files, so the existing user configuration is preserved untouched.

## Capability matrix

Portable `AgentCapabilities` → OpenCode `permission`:

| Portable              | OpenCode                         | State      |
| --------------------- | -------------------------------- | ---------- |
| `readFiles: true/false`  | `read: allow/deny`            | exact      |
| `writeFiles: true/false` | `edit: allow/deny`            | exact      |
| `shell: full`            | `bash: allow`                 | exact      |
| `shell: none`            | `bash: deny`                  | exact      |
| `shell: readonly`        | `bash: deny` + `FORJA-COMPAT-001` | degraded (never widened to full) |
| `network: true/false`    | `webfetch`/`websearch: allow/deny` | exact  |
| `skills: [...]`          | `skill: { "*": deny, <id>: allow }` | exact  |

OpenCode has no exact read-only shell primitive, so the documented fallback is
to disable shell access and emit a warning; it is never silently mapped to a
full shell. Unsupported semantics that would weaken safety are blocking
(`FORJA-COMPAT-002`); none are triggered by the current vocabulary.

## Explicit extensions (PRD 70)

`agent.yaml` / `skill.yaml` may carry a `harness:` block:

```yaml
harness:
  opencode:
    model: anthropic/claude-sonnet
```

The adapter merges `harness.opencode` into the Markdown frontmatter, so
harness-specific metadata is explicit and portable semantics stay untouched.

## Managed instructions

`AGENTS.md` is updated through a delimited managed block:

```md
<!-- forja:begin -->
# Forja agent instructions
...
<!-- forja:end -->
```

Everything outside the markers is user-authored and preserved. The adapter
composes the desired file from the current one and marks the artifact as a
**merge**; the sync planner therefore adopts an existing unowned `AGENTS.md`
instead of treating it as a collision (the manual content is already part of the
desired bytes). Edits *inside* the block still surface as conflicts.

## Bundled resources

Skills compile their bundled `references/`, `scripts/` and `assets/` files to
`.agents/skills/<id>/<resource>`. The IR exposes the skill directory so the
adapter can read resources without re-parsing packages.

## Diagnostic codes (Phase 5)

| Code              | Meaning                                   |
| ----------------- | ----------------------------------------- |
| `FORJA-COMPAT-001` | Capability degraded (read-only shell)    |
| `FORJA-COMPAT-002` | Capability unsupported (reserved)        |

## Consequences

- `forja validate`, `forja diff` and `forja sync` now produce real OpenCode
  configuration for a fixture project and resync without drift.
- Phase 6 can reuse the `.agents/skills` location and the managed-instructions
  pattern for Codex and Claude Code.
