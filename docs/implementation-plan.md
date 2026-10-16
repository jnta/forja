# Forja phased implementation plan

Status: Phases 1–10 complete (2026-10-15); Phases 11–12 not started. v1 release candidate prepared (publishing is a separate explicit action).
Source: [Forja PRD](./prd.md), draft 0.1, sections 1–97.
This is the executable roadmap; the PRD remains the preserved product draft. Phases 1–10 deliver v1, Phase 11 completes additional authoring/personal-library functionality, and Phase 12 covers explicitly future ecosystem work.

## Repository baseline and architecture

Inspected on 2026-10-13. The repository has no existing docs directory.
It is a private npm/TypeScript project with Next.js/React, LangGraph, Zod, an OpenCode SDK integration, ESLint and Vitest. Tests are colocated with implementation files.
The current software-team graph and OpenCode execution adapters implement an agent runtime. PRD section 6 excludes that runtime from the portability CLI.

Preserve the existing application and its tests while adding a separate CLI entry point and portability modules. Follow AGENTS.md: domain contracts import no frameworks; application use cases depend on domain ports; infrastructure implements ports; composition roots wire implementations. The existing CodingHarnessPort executes tasks and must not be reused as a compiler adapter interface. Use a distinct HarnessAdapterPort.

Use existing TypeScript, npm, Zod and Vitest conventions. The PRD recommends pnpm workspaces; retain npm/package-lock.json for this documentation change and record any future workspace migration as a separate architectural decision with an application regression gate. Start with the PRD recommendations: Commander.js, @clack/prompts, yaml, semver, execa and tsup or tsdown. Record final selection and package versions in Phase 1. No dependency versions or current harness capabilities are assumed by this plan. Use Node.js 22+ as the PRD baseline. Confirm supported Node versions and native harness formats against official documentation during implementation. Next.js and LangGraph are not runtime dependencies of the CLI.

The root package is private. Decide and document how to ship a standalone CLI package without publishing the existing web application; use a dedicated package/build boundary if needed. Do not silently change AGENTS.md or discard current functionality to match a suggested PRD layout.

## Sequential completion gate

Implement phases in numerical order. Within each phase: define observable behavior and fixtures, implement in the listed order, add positive/boundary/failure tests, run focused tests, then run repository verification and review the diff. Do not start the next phase until acceptance criteria pass.

At every gate run npm test, npm run lint, npx tsc --noEmit and npm run build using the installed dependencies. Add CLI build/package verification once available. Record actual results, environmental failures and unresolved issues; an environmental failure does not count as a passing check. Tests must use temporary project/home directories and controlled network fixtures, never a developer's real global configuration. No live LLM or paid service is required.

For each completed phase update this document with date, code/PR links, test evidence, remaining limitations and any decision changes. Acceptance means working code plus passing tests, not documentation alone. Existing runtime tests must continue to pass.

## Phase 1 — CLI foundation and architectural boundary

**Scope:** CLI bootstrapping and isolation from the existing application (PRD 6, 18, 31).
**Implementation order:** 1. Record packaging, supported platforms/Node baseline and module locations in an architecture decision. 2. Add domain ports for filesystem, package sources, adapters and diagnostics. 3. Add the CLI composition root, argument parsing, help/version and stable exit-code contract. 4. Configure standalone build and package smoke checks.
**Deliverables:** runnable local forja executable, package/build boundary, architecture decision, shared test fixtures and error conventions.
**Tests/acceptance:** invoke the built executable as a subprocess; help/version succeed, invalid commands fail clearly, imports obey layer rules, CLI works without starting Next.js/OpenCode or loading LLM dependencies. Existing application checks pass. Package contents contain only intended CLI assets.

### Phase 1 — completion record

- Completed: 2026-10-14.
- Code: `src/cli/` (entry `index.ts`, `main.ts` program factory, `container.ts` composition root, `exit-codes.ts`, `errors.ts`, `version.ts`, `commands/`), domain ports in `src/domain/{errors,diagnostics,filesystem,package-source,ir,harness-adapter}.ts`, infrastructure in `src/infrastructure/cli/{node-filesystem,console-reporter}.ts`, shared test helpers `src/test/helpers.ts`, and the layer guard `src/layer-boundaries.test.ts`.
- Build/package boundary: `tsup.config.ts` produces a self-contained ESM bundle at `packages/cli/dist/cli.js`; `packages/cli/package.json` (`@forja/cli`, `bin.forja`, `files: ["dist"]`) is the standalone publishable manifest. `npm run cli:build` builds it; `npm run cli` runs it.
- Decisions: [docs/decisions/0001-cli-foundation.md](./decisions/0001-cli-foundation.md) records packaging, Node >= 22, module locations, Commander 14.0.3 + tsup 8.5.1 selection (plus versions reserved for later phases), the exit-code contract 0/1/2/3/4 and the error conventions.
- Test evidence (Node 26.8.2, Linux x64): `npm test` → 12 files / 38 tests pass; `npm run lint` → clean; `npx tsc --noEmit` → clean; `npm run build` → succeeds. The e2e test builds the bundle and invokes it as a subprocess: `--version` prints `0.1.0` (exit 0), `--help` and no-args print help (exit 0), `bogus` exits 2 with `FORJA-CLI-002`. The bundle scan proves no `@langchain/`, `@opencode-ai/`, `next/dist` or `react-dom`, and `npm pack --dry-run` contains only `package.json` + `dist/`.
- Limitations: no subcommands yet (the command registry is intentionally empty; the positional fallback reports unknown commands until Phase 2 registers commands). Only Linux x64 was verified; macOS/Windows/WSL belong to Phase 10. The publishable manifest stays `private: true` until the release phase. npm/`package-lock.json` retained; pnpm workspaces remain deferred.

## Phase 2 — Canonical schemas, configuration and local library

**Scope:** Skill, Agent, Workflow, Policy, Pack and normalized IR; project/global loading (8–17, 29, 33, 59–60, 69–71).
**Implementation order:** 1. Specify versioned schemas and stable IDs. 2. Parse YAML and Markdown frontmatter through infrastructure. 3. Validate paths, names, references and graph relationships. 4. Define explicit global/project merge rules. 5. Normalize local definitions to deterministic IR; expose validate and list.
**Deliverables:** schemas, IR contracts, local library reader, diagnostics with file/field locations, precedence documentation and fixtures.
**Tests/acceptance:** valid definitions round-trip; malformed frontmatter/YAML, duplicate IDs, missing references, invalid versions, cycles, traversal and symlink escapes fail before writes. Test the complete precedence chain: defaults → global → packs → project → forja.local.yaml. Project/local overrides never change global files; forja.local.yaml is excluded from Git. Normalize harness-list/map examples, dependency-list/map examples, and fast/full, check/verify and quick/full command-object aliases or report a documented migration error. Verification commands remain strings and are never executed by validation. Stable ordering produces identical IR.

### Phase 2 — completion record

- Completed: 2026-10-14.
- Code: domain contracts `src/domain/{references,config,serialization}.ts` and extended `src/domain/ir.ts`/`filesystem.ts`; Zod schemas `src/application/schemas/`; precedence `src/application/config/{merge,gitignore}.ts`; library reader `src/application/library/{paths,frontmatter,diagnostics,definitions,load}.ts`; use cases `src/application/use-cases/{validate,list}.ts`; YAML adapter `src/infrastructure/yaml/yaml-parser.ts`; CLI commands `src/cli/commands/{validate,list}.ts`; shared fixtures `src/test/library-fixtures.ts`.
- Decisions: [docs/decisions/0002-canonical-schemas-and-precedence.md](./decisions/0002-canonical-schemas-and-precedence.md) fixes the on-disk layout, schemas, precedence/merge rules, alias normalization, safety guarantees and `FORJA-CFG-*` diagnostic codes.
- Test evidence (Node 26.8.2, Linux x64): `npm test` → 15 files / 65 tests pass; `npm run lint` → clean; `npx tsc --noEmit` → clean; `npm run build` → succeeds. Coverage includes a valid round-trip, malformed frontmatter/YAML, duplicate ids, missing references, invalid versions, dependency cycles, traversal and symlink escapes, the full precedence chain, a read-only filesystem proving no writes, a fixture proving verification commands are not executed, deterministic ordering, and CLI `validate`/`list --json` subprocess runs against temporary project/global directories.
- Limitations: packs contribute config but their remote content is not resolved yet (Phase 3); configured-but-not-installed components are warnings, not errors; `category` is free-form; harness extensions (PRD 70) are stripped until Phase 9. `FORJA_HOME` overrides the global root and is used by tests.

## Phase 3 — Version resolution, cache and lockfile

**Scope:** reproducible local/Git/registry packages and dependency bundles (13, 15–17, 23, 29).
**Implementation order:** 1. Specify source syntax, package identity and lockfile format for all component kinds. 2. Resolve semver constraints and pack transitive dependencies. 3. Fetch Git sources at immutable commits and registry metadata through source ports. 4. Verify integrity and populate cache. 5. Implement locked/offline resolution.
**Deliverables:** resolver, source adapters, content cache, forja.lock serializer and reproducibility contract.
**Tests/acceptance:** local fixture registries/Git repositories cover pinned versions, ranges, conflicting transitive constraints, cycles, missing versions, moving tags, corrupt cache, checksum mismatch and unavailable network. Risk summaries expose source, scripts and remote references before install; trust ask/deny/allow choices are testable. Noninteractive mode fails closed when confirmation is required unless explicit consent is supplied. Rejection writes no package/manifest/lock. Same manifest plus lock produces identical resolved content on two fresh directories. Locked mode does not silently upgrade; offline mode succeeds with complete cache and fails clearly when missing. Packages cannot escape extraction roots or execute bundled scripts. No public registry or placeholder PRD URL is assumed to exist.

### Phase 3 — completion record

- Completed: 2026-10-14.
- Code: domain contracts `src/domain/{package-source,cache,lockfile,trust}.ts` and `SkillDefinition.version`; application `src/application/resolve/{source-spec,integrity,enumerate,lockfile,trust,resolver}.ts`; infrastructure `src/infrastructure/sources/{local,registry,git}-source.ts` and `src/infrastructure/cache/content-cache.ts`; `YamlSerializerPort` in the YAML adapter.
- Decisions: [docs/decisions/0003-sources-resolution-and-lockfile.md](./decisions/0003-sources-resolution-and-lockfile.md) fixes source syntax, package identity, lockfile format, resolution rules, modes, cache and trust, plus `FORJA-PKG-*` codes.
- Test evidence (Node 26.8.2, Linux x64): `npm test` → 20 files / 97 tests pass; `npm run lint` → clean; `npx tsc --noEmit` → clean; `npm run build` → succeeds. Coverage includes local registries and local Git repositories for pinned/range resolution, transitive packs, conflicting constraints, cycles, missing versions, moving tags (pinned to an immutable commit), corrupt cache, checksum mismatch, unavailable sources, locked/offline modes, reproducibility across fresh directories, trust ask/deny/allow, fail-closed noninteractive rejection that writes nothing, extraction-root escape rejection, and proof that bundled scripts are never executed. No network is used.
- Limitations: only skills and packs are versioned (others record `0.0.0` and are pinned by source + commit); no user-facing install command yet (Phase 8); staging directories are cleaned by the caller; registry configuration is supplied programmatically until Phase 7 wires global config.

## Phase 4 — Pure compilation and safe synchronization

**Scope:** adapter protocol and managed output lifecycle (4.6–4.7, 20–22, 24, 31).
**Implementation order:** 1. Build a fixture compiler implementing the adapter contract. 2. Plan artifacts, ownership/checksums, collision handling and readable diffs. 3. Add dry-run/check paths. 4. Apply changes with staging, backups/recovery and concurrency protection. 5. Remove stale owned artifacts safely.
**Deliverables:** shared sync planner/writer, state manifest, diff command, sync --dry-run and sync --check; documented recovery behavior.
**Tests/acceptance:** diff and dry-run leave every file/cache/state unchanged; check returns a documented drift code. Second sync has no diff. Edited managed files and unmanaged target collisions block application. Stale files are removed only when still owned and unmodified. Inject failures during writes/state commit and prove recovery without lost manual content. Concurrent runs cannot corrupt state. Overlapping adapters deduplicate identical artifacts and reject differing bytes. Unknown ownership is never permission to overwrite. Interactive conflict choices show diff, overwrite, keep local or abort; noninteractive conflicts abort unless an explicit scoped flag is supplied. Tests prove keep-local preserves edits and reports unresolved drift, and overwrite requires explicit selection.

### Phase 4 — completion record

- Completed: 2026-10-14.
- Code: domain `src/domain/sync.ts` (ownership state, actions, conflicts) and `FilesystemPort.rename`; application `src/application/sync/{hash,diff,state,planner,writer}.ts` and `src/application/use-cases/sync.ts`; CLI `src/cli/commands/{diff,sync,plan-output}.ts` plus `ExitCode.Drift`; test fixture `src/test/fixture-adapter.ts`.
- Decisions: [docs/decisions/0004-managed-output-and-sync.md](./decisions/0004-managed-output-and-sync.md) documents the state manifest, planner rules, conflict handling, transactional writer/recovery, concurrency lock and `FORJA-SYNC-*` codes.
- Test evidence (Node 26.8.2, Linux x64): `npm test` → 25 files / 123 tests pass; `npm run lint` → clean; `npx tsc --noEmit` → clean; `npm run build` → succeeds; the built CLI exposes `diff`/`sync` and reports "No changes"/"Up to date" on an empty project. Coverage includes create/update/unchanged/delete planning, edited-managed and unmanaged-collision conflicts, stale deletion only when owned and unmodified, overlapping-adapter dedupe vs mismatch, artifact escape rejection, keep-local drift, overwrite requiring explicit selection, injected write failure with full rollback, and a held lock refusing a concurrent run. `dry-run`/`check` write nothing and `check` surfaces drift.
- Limitations: interactive prompt UI is deferred to Phase 7 (the resolver API and scoped flags exist and are tested); only configured adapters run, so real generated output arrives with the Phase 5 OpenCode adapter.

## Phase 5 — OpenCode portability adapter

**Scope:** first end-to-end project compiler (20, 31–32).
**Implementation order:** 1. Record tested native format/version and capability matrix from official documentation. 2. Compile skills/resources. 3. Compile primary/subagent roles and permission metadata. 4. Compile policies/workflows/instructions using safe managed boundaries. 5. Wire detection, inspection and project sync.
**Deliverables:** OpenCode compiler adapter distinct from the existing execution adapters; fixtures and capability diagnostics.
**Tests/acceptance:** golden outputs and native-format validation cover skills, assets/scripts, agent restrictions and explicit extensions. Existing opencode.json and AGENTS.md manual content is preserved. Unsupported restrictions produce blocking diagnostics when safety would be weakened. A local fixture project validates, previews, syncs and resyncs without drift; native discovery smoke testing uses an installed harness when available, with version/evidence recorded.

### Phase 5 — completion record

- Completed: 2026-10-15.
- Code: `src/infrastructure/adapters/portability/opencode/{opencode-adapter,skills,agents,permissions,instructions}.ts` (compiler adapter, distinct from the runtime `adapters/opencode/`); IR gained `SkillDefinition.directory`/`extensions` and `AgentDefinition.extensions`; `harness:` blocks added to the agent/skill schemas; `GeneratedArtifact.merge` for managed-block artifacts; the CLI container now registers the adapter and `runSync` selects adapters from the merged harness configuration.
- Decisions: [docs/decisions/0005-opencode-adapter.md](./decisions/0005-opencode-adapter.md) records the tested native format (OpenCode v2.0.28, docs 2026-10-15), locations, the capability matrix, extensions, the managed `AGENTS.md` block and `FORJA-COMPAT-*` codes.
- Test evidence (Node 26.8.2, Linux x64): `npm test` → 28 files / 138 tests pass; `npm run lint` → clean; `npx tsc --noEmit` → clean; `npm run build` → succeeds. Golden tests assert the exact `SKILL.md` and agent Markdown, resource copying, instructions block, capability warnings (`readonly` shell → `bash: deny`), explicit extensions, and that `opencode.json` is never emitted. A fixture project previews, syncs and resyncs without drift while preserving manual `AGENTS.md` content; the native smoke test records the installed `opencode` version when present.
- Limitations: only the OpenCode adapter exists (Codex/Claude in Phase 6); the IR compiles all local definitions (selection/resolution wiring lands with `add` in Phase 8); `shell: readonly` degrades to disabled shell because OpenCode has no exact primitive.

## Phase 6 — Claude Code and Codex adapters

**Scope:** complete initial three-harness portability (30–32).
**Implementation order:** 1. Document supported native formats and explicit fallback rules per adapter. 2. Implement Codex skills and hierarchical AGENTS.md integration. 3. Implement Claude skills/agents/tool restrictions and CLAUDE.md integration. 4. Add shared multi-harness compile and capability tests.
**Deliverables:** two compiler adapters, harness list/enable/disable/info and a tested compatibility matrix.
**Tests/acceptance:** each adapter passes the shared contract suite and golden/native-format tests. Preserve nested instruction hierarchy and existing user configuration. Report exact/degraded/unsupported capability states and stable diagnostic codes; strict compatibility makes unsupported semantics errors. Disabled shell can be an explicit safe fallback for unrepresentable readonly shell, with a warning; never map it silently to full shell. Instruction-only fallbacks require explicit configuration and describe their limitations. Combined sync handles shared .agents/skills and AGENTS.md without collisions. Disabling a harness removes only exclusive, unmodified owned artifacts.

### Phase 6 — completion record

- Completed: 2026-10-15.
- Code: `src/domain/capabilities.ts` (capability negotiation + diagnostics); `src/infrastructure/adapters/portability/{shared,claude,codex}` with the Claude and Codex compiler adapters and the shared skill/instructions renderers; `ProjectContext` gained `strict`/`instructionFallback`; config gained `compatibility.instructionFallback`; `runSync` blocks application on blocking diagnostics and passes compatibility options to adapters; `YamlDocumentPort` + `src/application/use-cases/harness.ts` + `forja harness list|enable|disable|info`.
- Decisions: [docs/decisions/0006-claude-and-codex-adapters.md](./decisions/0006-claude-and-codex-adapters.md) records native formats, the capability matrix, strict/instruction-fallback rules, shared-output handling and `FORJA-COMPAT-*` codes.
- Test evidence (Node 26.8.2, Linux x64): `npm test` → 33 files / 162 tests pass; `npm run lint` → clean; `npx tsc --noEmit` → clean; `npm run build` → succeeds. A shared contract suite runs all three adapters; golden tests cover Claude tool allowlists and Codex TOML; tests cover degraded/unsupported states, strict mode, instruction-only fallback, combined sync dedup of `.agents/skills`/`AGENTS.md`, harness enable/disable preserving `forja.yaml`, and removal of only a disabled harness's exclusive artifacts. CLI smoke: `harness list`, three-harness `sync`, `harness disable codex`, resync removes only `.codex/agents/*.toml`.
- Limitations: shared `.agents/skills` use portable frontmatter only (harness-specific skill extensions are not emitted there); Codex cannot enforce read-only files/offline network, so those require the instruction fallback; interactive prompt UI remains Phase 7.

## Phase 7 — Initialization and global/project workflows

**Scope:** usable onboarding and personal library (16–19, 23, 27–28).
**Implementation order:** 1. Implement project and global path selection and deterministic precedence. 2. Add noninteractive init options and file-based stack discovery for Maven/Gradle, JS/TS, Python, Go and Rust; suggest packs without auto-installing them. 3. Add interactive harness/starter/verification prompts. 4. Enable global installation/synchronization destinations. 5. Add read-only doctor diagnostics.
**Deliverables:** init, --global support across applicable commands, starter selection, effective-config reporting, doctor.
**Tests/acceptance:** project-only, global-only and mixed configurations work in isolated homes; project overrides never mutate global definitions. Init is safe on repeat, cancellation leaves no partial setup, existing config is preserved, and noninteractive runs never hang. Unwritable home, absent Git/harness, unsupported versions and stale outputs yield clear doctor diagnostics. Doctor performs no repair implicitly. Verification prompt values are propagated without running commands.

### Phase 7 — completion record

- Completed: 2026-10-15.
- Code: `src/application/scope.ts` (project/global resolution) and `src/application/discovery/stack.ts`; `src/application/use-cases/{init,doctor}.ts`; scope-aware native locations in `src/infrastructure/adapters/portability/shared/locations.ts`; `FilesystemPort.isWritable`; config gained `packs`; CLI `init`, `doctor`, `config` and `--global` on `init`/`validate`/`list`/`config`/`diff`/`sync`/`doctor`.
- Decisions: [docs/decisions/0007-init-scope-and-doctor.md](./decisions/0007-init-scope-and-doctor.md) documents scope resolution, global native destinations, init safety, stack discovery, doctor's read-only contract and effective-config reporting.
- Test evidence (Node 26.8.2, Linux x64): `npm test` → 38 files / 180 tests pass; `npm run lint` → clean; `npx tsc --noEmit` → clean; `npm run build` → succeeds. Coverage includes stack discovery, init idempotence/preservation/force/global, doctor checks (Node, Git, unwritable home, absent harness, invalid config) proving it never writes, scope resolution, and global sync writing native home configuration with an isolated home. CLI smoke: `init --yes`, `config`, `doctor`, `init --global --yes`, `validate --global`, `list --global`.
- Limitations: interactive prompts are exercised manually (automated tests cover noninteractive paths); global sync writes to the OS home (tests isolate it); packs are referenced in config but resolved in Phase 8.

## Phase 8 — Package lifecycle and updates

**Scope:** add/remove/update/outdated/list and pack management (23–27).
**Implementation order:** 1. Implement transactional add for explicit kinds, skill shorthand, versioned and Git sources. 2. Implement remove with reference-aware transitive cleanup. 3. Implement outdated current/wanted/latest reporting. 4. Implement targeted/all update, preview and pin protection. 5. Integrate manifest/lock updates with safe generated output changes.
**Deliverables:** full package lifecycle in project/global scope; readable update previews and recovery behavior.
**Tests/acceptance:** test all command forms, nested packs, shared dependencies, exact pins, range-compatible updates, skipped major versions, local package edits and target selection. Update dry-run changes nothing. Failed downloads/conflicts leave manifest, lock, installed content and managed outputs consistent. Remove retains dependencies referenced elsewhere and all manual files. Reports distinguish unavailable metadata from “up to date.”

### Phase 8 — completion record

- Completed: 2026-10-15.
- Code: `src/application/packages/{ref,available,add,remove,outdated,update}.ts`; config gained `sources`; `FilesystemPort.copy` and `YamlDocumentPort.setConfigValue`; CLI `add`, `remove`, `outdated`, `update` (with `--global`/`--kind`/`--dry-run`/`--yes`/`--json`); container builds the content cache, staging root and `createSources` factory.
- Decisions: [docs/decisions/0008-package-lifecycle.md](./decisions/0008-package-lifecycle.md) documents install locations, transactional ordering, reference-aware pruning, outdated/update semantics and pin protection.
- Test evidence (Node 26.8.2, Linux x64): `npm test` → 39 files / 191 tests pass; `npm run lint` → clean; `npx tsc --noEmit` → clean; `npm run build` → succeeds. Coverage includes registry add (skill + nested pack), unavailable-source add leaving state unchanged, reference-aware remove retaining shared dependencies and local definitions, outdated current/wanted/latest with unavailable metadata, update preview/apply, exact-pin protection, skipped major versions and target selection. CLI smoke: `add testing`, `add pack core`, `list`, `outdated`, `update`, `remove testing` (retained because a pack still references it).
- Limitations: `add <local path>` expects a source root (registry-style layout), not a single component directory; packs are referenced by name and resolved through configured ranges.

## Phase 9 — Extension metadata, policies and tool declarations

**Scope:** complete portable policy/workflow behavior and tool/MCP declarations promised in sections 1, 4, 11–12; sections 33–50 and 66–70.
**Implementation order:** 1. Specify declarative MCP/tool schema, trust and credential references; tool translation remains declarative, with documented exact/degraded/unsupported support. 2. Extend IR without introducing harness fields into domain contracts. 3. Compile declarations through each adapter's capability matrix. 4. Provide a documented adapter authoring contract and sample adapter. 5. Ship a versioned built-in catalog: orchestrator/implementer/reviewer (researcher optional), the ten core skills in section 47, and core-engineering/java-backend/frontend/distributed-systems packs; demonstrate composable technology skills.
**Deliverables:** policy/workflow fixtures, supported declarative tool mappings, extension validation, adapter developer guide.
**Tests/acceptance:** ordered workflow steps and verification strings survive each compiler. Unsupported declarations fail or use an explicit documented fallback. No workflow execution, LLM call, server startup or skill script execution occurs. Credential references do not copy secrets into generated files/state/logs. A fixture adapter can be registered without changing domain use cases; reserved IDs, unknown extensions and invalid output paths are rejected. All bundled catalog packages pass validation, resolve their dependencies, preserve referenced assets and compile through every supported adapter. Skill composition is expressed through references/instructions; Forja does not dynamically run agents.

### Phase 9 — completion record

- Completed: 2026-10-15.
- Code: `src/domain/tools.ts` (tool/MCP/credential contracts) and IR fields (`tools`, `mcpServers`, agent `tools`/`mcp`); agent schema `tools`/`mcp`; loader aggregation + unknown-extension warning (`FORJA-CFG-014`); `declarationDiagnostics` + `validateAdapterId`/reserved ids (`FORJA-COMPAT-003`); instructions renderer Tools/MCP sections (references only); sample adapter + authoring guide; built-in `catalog/` (3 agents, 10 core skills, 4 packs).
- Decisions: [docs/decisions/0009-extensions-and-catalog.md](./decisions/0009-extensions-and-catalog.md) and [docs/adapters/authoring.md](./adapters/authoring.md).
- Test evidence (Node 26.8.2, Linux x64): `npm test` → 41 files / 204 tests pass; `npm run lint` → clean; `npx tsc --noEmit` → clean; `npm run build` → succeeds. Coverage includes credential references not copying secrets, declarative fallback diagnostics, unknown-extension warnings, reserved/malformed adapter ids, fixture adapter registration, escaping artifact rejection, compiler adapters importing no execution/LLM stacks, and the catalog validating, resolving pack dependencies, preserving the `documentation` asset and compiling through all four adapters with ordered workflow steps and verification strings.
- Limitations: tools/MCP compile to instructions (native configuration is manual by design); the catalog ships in the repository and is not yet bundled into the CLI package.

## Phase 10 — Release readiness and reproducible distribution

**Scope:** globally installable v1 with documented supported-platform behavior (3, 5–7, 51–65, 72–75, 80–85, 89–91, 96).
**Implementation order:** 1. Audit complete PRD coverage and close remaining requirements. 2. Add CI checks and platform matrix for macOS/Linux/Windows/WSL. 3. Validate standalone package build/install in disposable environments. 4. Write user/author/adapter guides, troubleshooting and upgrade/recovery procedures. 5. Select license and release metadata; prepare release artifact.
**Deliverables:** release candidate package, CI, compatibility matrix, examples, documentation and requirement traceability.
**Tests/acceptance:** tarball installation exposes forja and supports init → add pack → validate → diff → sync → update → remove → resync with fixtures for all three harnesses. Fresh machines reproduce locked output; global and project state remain independent. Platform tests cover spaces, Unicode, separators, permissions and line endings; concurrency/recovery checks pass. All repo checks pass and package excludes web/runtime dependencies and secrets. Validate --json and --quiet/--verbose/--debug output contracts without leaking secrets; errors have code, cause and suggested fix. Telemetry is disabled. Benchmark a documented ordinary local fixture, hardware and sample method against validate <300 ms, diff <500 ms and sync <1 s excluding downloads. Record >80% portable catalog packages, >90% exact Tier-1 feature representation, 100% idempotent fixture sync and zero known silent overwrite cases; distinguish measured results from targets. Publishing is a separate explicit release action; this phase prepares and tests the artifact.

## Phase 11 — Personal portability and authoring (v1.x)

**Scope:** export/import, create skill/agent/pack, deterministic linting (76–78).
**Implementation order:** 1. Define a versioned export containing manifest/source pins and preferences without machine paths or secrets. 2. Add import validation/preview and explicit safe application. 3. Add authoring templates. 4. Add lint diagnostics for skill names/descriptions and references.
**Deliverables:** export/import commands, scaffolding commands, lint command and author guide.
**Tests/acceptance:** export → import into a fresh home reproduces selections/pins; import conflicts and invalid sources leave state unchanged. Scaffolded packages validate and sync; repeated creation never overwrites authored files. Lint has stable actionable codes, documented heuristic limits and JSON output; no LLM access is required. Profiles are reserved for Phase 12.

## Phase 12 — Ecosystem expansion (future, after v1.x)

**Scope:** sections 67–68, 76, 79, 86, 93: installable adapters/SDK, named profiles and optional eval framework. These are not v1 release blockers.
**Implementation order:** 1. Version and package @forja/adapter-sdk with contract/golden helpers. 2. Add adapter installation and explicit trust checks. 3. Add named/profile Git-source installation using existing resolver and import machinery. 4. Define eval fixtures and an opt-in runner with explicit execution/cost boundaries.
**Deliverables:** SDK release candidate, community-adapter sample, adapter add/profile commands and optional eval tooling.
**Tests/acceptance:** install a fixture community adapter from its packaged artifact, reject incompatible SDK versions and duplicate IDs, and run the shared suite. Profiles reproduce locked definitions on a fresh home without leaking secrets. Eval fixtures cover should-trigger/should-not-trigger cases and deterministic mocked results; installation never runs evals. Real model-dependent eval runs require configured providers and explicit invocation. Hosted marketplace/private-registry services, cloud/remote execution and runtime orchestration require separate PRDs.

## Requirement coverage and deferred work

| Recovered PRD area | Implemented in phases |
| --- | --- |
| Vision, deterministic/safe generation, v1 goals (1–7) | 1, 4–8, 10 |
| Five primitives and project/global config (8–17) | 2–3, 7–9 |
| CLI, init, sync, diff, dry-run/check (18–22) | 1, 4–7 |
| Add/remove/update/outdated/list (23–27) | 3, 8 |
| Doctor/validate/harness management (28–30) | 2, 6–7 |
| Adapter contract and initial targets (31–32) | 4–6, 9 |
| IR, capabilities, extensions, boundaries (33–35, 66, 69–70, 88) | 1–2, 4–6, 9 |
| Sources, semver, integrity, trust, scripts (36–42) | 3, 8 |
| Ownership/conflicts/instructions (43–45) | 4–6 |
| Catalog/composition/discovery/verification (46–50) | 2, 7, 9 |
| CI, technology, tests, fixtures (51–65, 96) | 1–6, 10 |
| SDK/installable adapters (67–68) | 9, 12 |
| Precedence/distribution/onboarding/global setup (71–75) | 2, 7, 10 |
| Export/import/authoring/lint (76–78) | 11 |
| Evals and telemetry (79–80) | 10, 12 |
| Errors/performance/offline (81–83) | 1, 3, 10 |
| MVP, phased suggestions, proposed architecture (84–88, 95) | 1–10; sequencing reconciliation below |
| v1 done, metrics and risks (89–91) | 4–6, 10 |
| Positioning/vision/product definition (92–94, 97) | 1, 10, 12 |

A hosted marketplace, agent runtime, live orchestration, IDE, model-provider keys and universal proprietary feature translation remain outside v1 (section 6). A Git-backed registry source is in scope; creating a hosted registry service is not necessary.

## Reconciliation of the draft's suggested sequences

Sections 86 and 95 give different suggested orders. This roadmap makes dependency ordering explicit: schemas/local definitions precede resolution; the safe writer precedes real harness writes; OpenCode precedes Codex then Claude. Small agent and pack contracts are designed early so the lockfile/IR need no rewrite; full catalog behavior arrives later. Integrity/trust enter with the first remote installer rather than waiting for updates. This is a sequencing refinement, not a change to product scope.

The MVP described in section 84 is a checkpoint after Phase 8: all three harnesses, canonical skills/agents/policies, init/add/remove/list/sync/diff/validate/doctor, sources, locks/integrity and safe writes must pass together. Phase 9 completes the catalog/workflow/extension vision; Phase 10 proves section 89's v1 release workflow. Phase 11 contains later authoring features; Phase 12 is explicitly future. Record final decisions about optional local config, tools and export format before their dependent implementation.

Do not treat draft example versions, registry URLs or compatibility labels as verified operational facts. Validate native formats and registry availability when implementing the corresponding phase.
