# ADR 0006 — Claude Code and Codex adapters, capability matrix and harness management

- Status: accepted
- Date: 2026-10-15
- Phase: 6 (see [../implementation-plan.md](../implementation-plan.md))
- PRD references: sections 30–32, 34–35, 43–45, 69–70

## Tested native formats

Consulted on 2026-10-15:

- Claude Code: `https://docs.claude.com/en/docs/claude-code/sub-agents`,
  `https://code.claude.com/docs/en/skills`.
- Codex: `https://developers.openai.com/codex/agent-configuration/agents-md`,
  `.../subagents`.

| Surface | Claude Code | Codex |
| ------- | ----------- | ----- |
| Skills | `.claude/skills/<id>/SKILL.md` | `.agents/skills/<id>/SKILL.md` (shared with OpenCode) |
| Agents | `.claude/agents/<id>.md` (`name`, `description`, `tools`) | `.codex/agents/<id>.toml` (`name`, `description`, `developer_instructions`) |
| Instructions | `CLAUDE.md` managed block | `AGENTS.md` managed block (hierarchical; root + nested) |

Neither adapter writes `settings.json`, `config.toml` or any other user-owned
configuration file.

## Capability matrix

Portable capabilities → native representation, with an exact/degraded/unsupported
state (PRD 34–35):

| Capability | OpenCode | Claude Code | Codex |
| ---------- | -------- | ----------- | ----- |
| `readFiles` on/off | exact (`read`) | exact (Read/Grep/Glob) | on exact; off unsupported |
| `writeFiles` off | exact (`edit: deny`) | exact (omit Edit/Write) | **unsupported** (cannot enforce) |
| `shell: none` | exact (`bash: deny`) | exact (omit Bash) | exact (`features.shell_tool = false`) |
| `shell: full` | exact (`bash: allow`) | exact (Bash) | exact |
| `shell: readonly` | degraded → shell disabled | degraded → Bash omitted | degraded → shell disabled |
| `network` off | exact (`webfetch`/`websearch: deny`) | exact (omit WebFetch/WebSearch) | **unsupported** |
| `skills` scoping | exact (`skill` map) | exact (`Skill` tool) | degraded (skills inherit) |

Read-only shell is never silently widened to a full shell: the documented safe
fallback is to disable shell access and emit `FORJA-COMPAT-001`.

## Diagnostics, strict mode and instruction-only fallbacks

- `unsupported` → `FORJA-COMPAT-002` (error) unless an instruction-only fallback
  is explicitly enabled.
- `degraded` → `FORJA-COMPAT-001` (warning), or an error under
  `compatibility.strict: true`.
- `compatibility.instructionFallback: true` downgrades unsupported agent
  semantics to warnings and lets Codex emit an instruction-only agent TOML that
  lists the limitations explicitly. Without it, Codex emits no agent for that
  role.
- `runSync` treats blocking diagnostics as a stop: `apply` writes nothing when
  any error is present, so unsafe output is never generated.

## Shared output and combined syncs

OpenCode and Codex both read `.agents/skills` and `AGENTS.md`. To avoid
collisions:

- both render skills through `shared/skills.ts` (portable fields only), so the
  bytes are identical and the sync planner deduplicates them;
- both render the instructions block through `shared/instructions.ts`, so
  `AGENTS.md` is identical;
- Claude uses its own `.claude/skills` and `CLAUDE.md`.

The ownership state records the merged harness set (`codex,opencode`) for shared
artifacts. Disabling a harness therefore removes only artifacts exclusive to it
when they are still owned and unmodified; shared files and other harnesses'
output remain.

## Harness management (PRD 30)

`forja harness list|enable|disable|info` reads and updates the `harnesses`
mapping in `forja.yaml` through `YamlDocumentPort`, preserving other keys.
Adapters are selected at sync time from the merged configuration.

## Diagnostic codes (Phase 6)

| Code              | Meaning |
| ----------------- | ------- |
| `FORJA-COMPAT-001` | Capability degraded (warning, or error under strict) |
| `FORJA-COMPAT-002` | Capability unsupported (error unless instruction fallback) |

## Consequences

- Forja now compiles the initial three harnesses from one IR.
- `forja sync` produces OpenCode, Claude Code and Codex configuration together
  and resyncs without drift; disabling a harness cleans up only its exclusive
  output.
- Limitation: shared `.agents/skills` use portable frontmatter only, so
  harness-specific skill extensions are not emitted there.
