# ADR 0001 — CLI foundation and architectural boundary

- Status: accepted
- Date: 2026-10-14
- Phase: 1 (see [../implementation-plan.md](../implementation-plan.md))
- PRD references: sections 6, 18, 31, 71, 81, 87, 88, 96

## Context

The repository is a private npm/TypeScript package that currently ships only a
Next.js/LangGraph application for the in-repo software-team runtime. The Forja
product, however, is a **portability CLI**: it generates harness configuration
and must not call LLMs, start OpenCode, or import the runtime. The CLI has to
ship independently from the web application without disturbing it.

This ADR records the packaging, platform baseline, module layout, dependency
selection and error/exit-code conventions established in Phase 1. Later phases
extend these contracts rather than replacing them.

## Decision

### 1. Module locations

Source stays inside the existing `src/` tree so it shares one tsconfig, one test
runner and the paths alias. The layered rules from `AGENTS.md` are preserved and
extended with a dedicated CLI presentation layer:

```text
src/domain/          Contracts only: ports, IR, diagnostics, error conventions.
src/application/     Use cases and the existing software-team graph.
src/infrastructure/  Adapters implementing domain ports (OpenCode runtime,
                     Node filesystem, console diagnostics, later compilers).
src/app/             Next.js presentation (unchanged web application).
src/container.ts     Web composition root (unchanged).
src/cli/             CLI presentation layer and its own composition root.
src/test/            Test-only helpers (temporary directories, fixtures).
```

`src/cli/container.ts` is a second composition root. Composition roots
(`src/container.ts` and `src/cli/container.ts`) are the only modules allowed to
import from `infrastructure`. Every other file in a presentation layer depends
on `application` and `domain` only. This is enforced by
`src/layer-boundaries.test.ts`.

The CLI must never import `@/container`, the Next.js/React stack, the LangGraph
packages or `@/infrastructure/adapters/opencode`. This keeps `forja` usable
without the runtime and is asserted both by the layer test and by scanning the
built bundle.

### 2. Packaging and build boundary

- Source: `src/cli/`.
- Bundler: **tsup 8.5.1** (esbuild).
- Output: a single self-contained ESM bundle at `packages/cli/dist/cli.js`
  (plus a source map). All CLI dependencies are bundled, so the published
  package has **no runtime dependencies**.
- Publishable manifest: `packages/cli/package.json` (name `@forja/cli`),
  `bin.forja -> dist/cli.js`, `files: ["dist"]`, `engines.node >= 22`.
  It is marked `private: true` until the Phase 10 release step prepares the
  artifact, which prevents an accidental publish of this repository.
- The root `package.json` remains the private Next.js application and is never
  the published artifact.

This is a dedicated package/build boundary without introducing npm/pnpm
workspaces yet.

### 3. Supported platforms and Node baseline

- Node.js **>= 22** (`engines.node`), matching PRD 96. Development and the
  Phase 1 gate ran on Node 26.8.2 / Linux x64.
- Target platform for the bundle: `node22`, ESM output.
- macOS, Linux, Windows and WSL are the v1 platform matrix (Phase 10). Only
  Linux x64 has been verified so far; this ADR records that limitation.

### 4. Dependency selection and pinned versions

| Area                | Choice           | Version  | Introduced in |
| ------------------- | ---------------- | -------- | ------------- |
| CLI parsing         | `commander`      | 14.0.3   | Phase 1       |
| Bundler             | `tsup`           | 8.5.1    | Phase 1       |
| Schema validation   | `zod` (existing) | 4.6.2    | Phase 2       |
| YAML                | `yaml`           | 2.9.1    | Phase 2–3     |
| Semver              | `semver`         | 7.8.5    | Phase 3       |
| Process execution   | `execa`          | 9.6.1    | Phase 3+      |
| Interactive prompts | `@clack/prompts` | 0.11.0   | Phase 7       |
| Testing             | `vitest` (existing) | 4.1.11 | —            |

All CLI libraries are declared as `devDependencies` of the private root package
because they are bundled into the standalone artifact. npm and
`package-lock.json` are retained for now. Migrating to pnpm workspaces (PRD 96)
is deliberately deferred to a separate ADR with an application regression gate.

### 5. Exit-code contract

Stable, documented codes for scripted use:

| Code | Name      | Meaning                                              |
| ---- | --------- | ---------------------------------------------------- |
| 0    | Success   | Command completed.                                   |
| 1    | Failure   | Unexpected/internal error or an environmental fault. |
| 2    | Usage     | Invalid command, option or argument.                 |
| 3    | Config    | Invalid configuration or definitions (reserved).    |
| 4    | Conflict  | Refused destructive managed-file action (reserved).  |

`src/cli/exit-codes.ts` maps `ForjaError.kind` to these codes. Commander
parse/help/version exits are translated to `Success` (help/version) or `Usage`
(parse errors).

### 6. Error conventions

Every user-facing failure is a `ForjaError` (`src/domain/errors.ts`) carrying:

- `code`: stable identifier in the form `FORJA-<AREA>-<NNN>`
  (for example `FORJA-CLI-002`). PRD 81 uses `FORJA-102`/`FORJA-COMPAT-014`;
  Phase 1 fixes the `AREA` vocabulary as CLI, CFG, PKG, SYNC, COMPAT.
- `kind`: `usage | config | conflict | network | internal`, mapped to an exit
  code.
- `message`, optional `cause` and optional `resolution` (suggested fix).

Diagnostics returned by adapters/validators are plain data
(`src/domain/diagnostics.ts`) with a code, severity, message, optional
file/field location and optional resolution. They are reported through
`DiagnosticReporterPort`, never thrown from domain code.

## Consequences

- The CLI can be built and invoked without Next.js, LangGraph or OpenCode.
- Later phases add ports and adapters without touching the web application.
- The layer test and bundle scan will fail fast if someone reintroduces a
  runtime dependency into the CLI.
- Publishing remains a separate, explicit action (Phase 10).
