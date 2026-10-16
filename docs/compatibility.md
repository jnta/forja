# Compatibility matrix

Tested native formats (2026-10-15): OpenCode v2.0.28, Claude Code and Codex per
their official documentation. See ADRs 0005 and 0006 for details.

## Harnesses

| Surface | OpenCode | Claude Code | Codex |
| ------- | -------- | ----------- | ----- |
| Skills | `.agents/skills/<id>/SKILL.md` | `.claude/skills/<id>/SKILL.md` | `.agents/skills/<id>/SKILL.md` |
| Agents | `.opencode/agents/<id>.md` | `.claude/agents/<id>.md` | `.codex/agents/<id>.toml` |
| Instructions | `AGENTS.md` (managed block) | `CLAUDE.md` (managed block) | `AGENTS.md` (managed block) |
| User config preserved | `opencode.json` | `settings.json` | `config.toml` |

Global scope writes to `~/.config/opencode`, `~/.claude`, `~/.codex` and
`~/.agents`.

## Capabilities

| Portable | OpenCode | Claude Code | Codex |
| -------- | -------- | ----------- | ----- |
| read on/off | exact | exact | on exact / off unsupported |
| write off | exact | exact | unsupported |
| shell none / full | exact | exact | exact |
| shell readonly | degraded → disabled | degraded → Bash omitted | degraded → disabled |
| network off | exact | exact | unsupported |
| skills scoping | exact | exact | degraded |
| tools / MCP | documented in instructions | documented in instructions | documented in instructions |

`exact` = represented natively; `degraded` = documented, non-silent fallback
(warning); `unsupported` = error unless `compatibility.instructionFallback`.
Read-only shell is never widened to a full shell.

## Platforms

| Platform | Status |
| -------- | ------ |
| Linux x64 | verified locally (all gates + benchmark) |
| macOS | CI matrix (GitHub Actions) |
| Windows | CI matrix (GitHub Actions) |
| WSL | CI matrix (GitHub Actions) |

Robustness tests cover paths with spaces and Unicode, CRLF preservation, LF
output, concurrency and recovery. Node.js 22+ is required.

## Performance (measured)

Ordinary local fixture, Node 26.8.2 / Linux x64, including process startup:

| Command | Target | Measured |
| ------- | ------ | -------- |
| `forja validate` | < 300 ms | ~289 ms |
| `forja diff` | < 500 ms | ~283 ms |
| `forja sync` | < 1 s | ~293 ms |

Run `npm run bench` to reproduce.
