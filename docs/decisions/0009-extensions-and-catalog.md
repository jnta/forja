# ADR 0009 — Extension metadata, tool/MCP declarations and the built-in catalog

- Status: accepted
- Date: 2026-10-15
- Phase: 9 (see [../implementation-plan.md](../implementation-plan.md))
- PRD references: sections 1, 4, 11–12, 33–50, 66–70

## Decision

### 1. Declarative tools, MCP and credentials

Domain contracts (`src/domain/tools.ts`) are harness-agnostic:

- `ToolDeclaration { name, description?, source: "builtin"|"mcp", server? }`
- `McpServerDeclaration { id, transport, command?, args?, url?, credentials? }`
- `CredentialReference { name, from: "env"|"file"|"keychain", key }`

Agents may declare `tools:` and `mcp:` in `agent.yaml`; the loader aggregates
them into `ForjaIr.tools` / `ForjaIr.mcpServers`. **Credentials are references
only** — there is no value field, so secrets are never stored or copied into
generated files, state or logs.

### 2. Tool/MCP translation

Forja does not write harness-native MCP configuration (OpenCode `opencode.json`,
Codex `config.toml`) because those are user-owned files. Declarations compile
into a documented, non-silent fallback: a `## Tools` / `## MCP servers` section
in the managed instructions (AGENTS.md/CLAUDE.md), listing declarations and
credential *references*. Each adapter reports this as `FORJA-COMPAT-001`
(degraded; an error under strict compatibility). No workflow is executed, no LLM
is called, no server is started and no skill script runs.

### 3. IR stays harness-agnostic

`extensions`/`harness:` blocks carry harness-specific metadata out-of-band
(PRD 70). Unknown harness keys produce `FORJA-CFG-014` (warning). Reserved or
malformed adapter ids are rejected by `validateAdapterId` (`FORJA-COMPAT-003`).

### 4. Adapter authoring contract

See [../adapters/authoring.md](../adapters/authoring.md). A sample adapter
(`src/infrastructure/adapters/portability/sample/sample-adapter.ts`) implements
`HarnessAdapterPort` and is registrable from the composition root without
changing domain use cases. Compiler adapters must not import execution or LLM
stacks; artifacts that escape the project root are rejected by the planner.

### 5. Built-in catalog

`catalog/` is a versioned library root shipped with the repository:

- agents: `orchestrator` (primary), `implementer`, `reviewer`;
- the ten core skills from PRD 47;
- packs: `core-engineering`, `java-backend`, `frontend`,
  `distributed-systems`.

All catalog packages validate, resolve their dependencies through the resolver,
preserve referenced assets (e.g. `documentation/references/guide.md`) and compile
through every supported adapter. Skill composition is expressed through
references and instructions only.

## Consequences

- Ordered workflow steps and verification strings survive every compiler.
- Unsupported declarations use an explicit, documented fallback.
- The catalog doubles as an integration fixture for adapters and resolution.
