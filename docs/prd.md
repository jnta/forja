> Source: Forja draft 0.1 from “Run Local Pipelines”, 2026-10-13. Sections 1–32 were retrieved from the conversation; sections 33–97 were supplied by the user. The supplied tail has been formatted as Markdown without changing its requirements.
> Original citation markers are retained as source metadata; source URLs were unavailable. Example harness versions, compatibility claims and registry addresses are draft proposals to verify during implementation.

# Forja

**Agent Harness Portability Layer**

**Status:** Draft  
**Version:** 0.1  
**Product type:** Open-source developer tool / CLI  
**Primary interface:** Terminal  
**Initial platforms:** macOS, Linux, Windows/WSL  
**Initial harness targets:** OpenCode, Claude Code, Codex  
**License recommendation:** Apache-2.0 or MIT

---

# 1. Executive Summary

Forja is a portable configuration and package-management layer for AI coding agents.

It allows developers to define reusable:

- agent skills
- agent roles
- workflows
- engineering rules
- verification policies
- tool/MCP declarations
- reusable agent packs

once and use them across multiple AI coding harnesses such as:

- OpenCode
- Claude Code
- Codex
- future agent harnesses

The core idea is:

> **Engineering methodology should belong to the developer, not to the AI harness.**

Today, AI coding tools expose similar concepts using different directory layouts, configuration formats, permission systems, and agent definitions.

A developer may maintain:

```text
.opencode/
.claude/
.codex/
AGENTS.md
CLAUDE.md
```

with duplicated or subtly different instructions.

Forja introduces a canonical representation:

```text
Forja Core
    ↓
skills
agents
workflows
policies
packs
    ↓
Adapters
    ↓
OpenCode / Claude Code / Codex / ...
```

Forja acts similarly to a combination of:

- package manager
- configuration compiler
- dependency manager
- synchronization engine
- compatibility layer

for agent-driven software development.

---

# 2. Problem Statement

AI coding harnesses increasingly support the same conceptual building blocks:

```text
instructions
skills
agents/subagents
permissions
tools
MCP servers
workflows
verification
```

but represent them differently.

For example, OpenCode supports reusable `SKILL.md` skills, including discovery from `.agents/skills`, and has its own primary/subagent definitions and permission model. :chatgpt-content-reference{index="0"}

Codex uses hierarchical `AGENTS.md` instructions and supports Agent Skills built around `SKILL.md`; OpenAI currently describes its skills as compatible with the open Agent Skills standard. :chatgpt-content-reference{index="1"}

Modern coding-agent guidance also increasingly favors keeping persistent repository instructions concise while moving specific workflows into reusable skills. :chatgpt-content-reference{index="2"}

This creates several problems.

### Duplication

A developer may have to represent the same code-review behavior separately for:

```text
OpenCode
Claude Code
Codex
Cursor
```

### Vendor lock-in

Engineering workflows become coupled to the syntax of a particular harness.

### Configuration drift

A testing skill may be updated for OpenCode but remain outdated for Claude Code.

### Difficult distribution

Sharing a good agent setup usually involves copying folders, dotfiles, GitHub repositories, or snippets manually.

### Poor version management

There is usually no consistent way to say:

```text
testing@2.3.0
java@1.4.0
code-review@3.1.2
```

and reproduce that configuration somewhere else.

### No unified compatibility model

An agent configuration may use functionality supported by one harness but not another.

### Hard migration

Switching coding agents often means rebuilding a large amount of infrastructure.

---

# 3. Product Vision

Forja should make this possible:

```bash
npm install -g @forja/cli
```

Then:

```bash
forja init
```

And configure:

```yaml
# forja.yaml

version: 1

harnesses:
  - opencode
  - claude-code
  - codex

agents:
  - orchestrator
  - implementer
  - reviewer

skills:
  - testing
  - debugging
  - code-review
  - api-design
  - java
  - distributed-systems

workflows:
  - feature
  - bugfix
  - refactor

verification:
  fast: make check
  full: make verify
```

Then:

```bash
forja sync
```

Forja generates the necessary configuration for each selected harness.

Conceptually:

```text
                 forja.yaml
                     │
                     ▼
                Forja Core
                     │
          ┌──────────┼──────────┐
          │          │          │
       skills      agents    workflows
          │          │          │
          └──────────┼──────────┘
                     │
                normalization
                     │
                     ▼
               Forja IR
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
    OpenCode       Claude       Codex
     Adapter       Adapter      Adapter
```

The user owns the canonical configuration.

Harness configuration becomes generated output.

---

# 4. Product Principles

## 4.1 Harness independence

Forja's core model must never depend on a single harness.

Harness-specific behavior belongs exclusively to adapters.

---

## 4.2 Portable first, specialized second

Common functionality should remain portable.

Harness-specific capabilities should still be available through explicit extension metadata.

Example:

```yaml
metadata:
  opencode:
    slash: true
```

The portable representation remains clean while advanced users retain access to native functionality.

---

## 4.3 Skills over giant prompts

Skills should contain focused reusable knowledge.

Avoid a single enormous system prompt containing every engineering rule.

```text
testing
debugging
code-review
api-design
postgresql
java
kafka
```

should remain individually composable.

---

## 4.4 Roles over technology agents

Agents represent responsibilities:

```text
orchestrator
implementer
reviewer
researcher
```

Skills represent capabilities:

```text
java
spring
kafka
testing
debugging
```

Do not model:

```text
JavaAgent
KafkaAgent
PostgresAgent
```

unless there is an actual isolated agent responsibility requiring it.

---

## 4.5 Deterministic verification over LLM confidence

Agents can review work.

They cannot be the final source of truth.

Projects should define executable verification such as:

```bash
make check
make verify
```

Forja helps propagate those expectations to harnesses.

---

## 4.6 Generated configuration must be safe

Forja must never silently destroy manually authored configuration.

Generated files require:

- ownership tracking
- checksums
- conflict detection
- dry-run support
- readable diffs

---

## 4.7 Git-friendly

Generated project configuration should be deterministic.

Running:

```bash
forja sync
```

twice without input changes must produce no diff.

---

# 5. Goals

Forja v1 should allow a developer to:

1. Install Forja globally.
2. Maintain a personal/global library of skills and agents.
3. Install skills from remote registries or Git repositories.
4. Install collections of skills as packs.
5. Enable one or more supported AI harnesses.
6. Synchronize canonical definitions into harness-compatible configuration.
7. Update installed skills.
8. Pin skill versions.
9. Detect local modifications and conflicts.
10. Validate skill and agent definitions.
11. Inspect what would change before synchronizing.
12. share a reproducible Forja configuration through Git.
13. distinguish global and project-specific configuration.
14. detect harness compatibility problems.
15. add new harnesses through adapters without redesigning the core.

---

# 6. Non-Goals for v1

Forja should **not initially be an AI agent runtime**.

It should not:

- call LLM APIs itself
- replace OpenCode
- replace Claude Code
- replace Codex
- execute autonomous coding sessions
- implement its own agent loop
- orchestrate live subagents
- provide an IDE
- provide a hosted marketplace
- store API keys for model providers
- attempt universal translation of every proprietary harness feature

These could eventually become separate capabilities, but making them part of v1 would substantially weaken the portability goal.

Forja v1 is:

> **configuration infrastructure for agents, not an agent itself.**

---

# 7. Target Users

## Primary Persona — Power Developer

A developer who regularly uses AI coding agents and maintains their own:

- coding conventions
- review rules
- agent roles
- skills
- testing workflows

They may switch between OpenCode, Claude Code, and Codex.

---

## Secondary Persona — Engineering Team

A team wants consistent agent behavior across developers regardless of preferred harness.

The repository can contain:

```text
forja.yaml
forja.lock
```

Each developer can use:

```bash
forja sync
```

for their preferred harness.

---

## Future Persona — Skill Author

A developer publishes reusable:

```text
Java backend pack
Spring pack
DDD pack
security-review pack
frontend pack
```

that other Forja users install.

---

# 8. Core Domain Model

Forja should define five primary primitives.

```text
Skill
Agent
Workflow
Policy
Pack
```

---

# 9. Skill

A Skill is reusable knowledge or a reusable procedure.

Examples:

```text
testing
debugging
code-review
api-design
java
postgresql
kafka
distributed-systems
```

Canonical layout:

```text
skills/
└── code-review/
    ├── SKILL.md
    ├── skill.yaml
    ├── references/
    ├── scripts/
    └── assets/
```

`SKILL.md` should follow the open Agent Skills format whenever possible.

Example:

```md
---
name: code-review
description: Reviews software changes for correctness and regressions.
---

# Code Review

Prioritize:

1. correctness
2. regressions
3. security
4. concurrency
5. architecture
6. testing

Report findings by severity.
```

This aligns naturally with current OpenCode and Codex skill discovery models. :chatgpt-content-reference{index="3"}

Optional Forja metadata:

```yaml
# skill.yaml

version: 1.3.0

category: engineering

tags:
  - review
  - quality

compatibility:
  opencode: ">=2"
  claude-code: "*"
  codex: "*"

dependencies:
  - testing@^2.0.0
```

---

# 10. Agent

An Agent represents a responsibility.

Example:

```text
reviewer
```

Directory:

```text
agents/
└── reviewer/
    ├── AGENT.md
    └── agent.yaml
```

`AGENT.md`:

```md
# Reviewer

Perform an independent review of the implementation.

Do not modify code.

Focus on:

- correctness
- regressions
- concurrency
- security
- architecture
- missing tests

Return findings ordered by severity.
```

`agent.yaml`:

```yaml
name: reviewer
type: subagent

capabilities:
  filesystem:
    read: true
    write: false

  shell:
    enabled: true
    mutating: false

skills:
  - code-review
  - testing
```

This is the canonical semantic definition.

An adapter translates it.

For example:

```text
Forja Reviewer
       │
       ├──── OpenCode permissions
       ├──── Claude tools
       └──── Codex configuration
```

OpenCode already represents agents as named profiles combining prompts, model settings, modes, and permissions, demonstrating why this translation layer is necessary. :chatgpt-content-reference{index="4"}

---

# 11. Workflow

A Workflow describes an engineering process.

Example:

```yaml
# workflows/feature.yaml

name: feature

steps:
  - explore
  - plan
  - implement
  - check
  - review
  - fix-findings
  - verify
```

Another:

```yaml
name: bugfix

steps:
  - reproduce
  - investigate
  - regression-test
  - implement
  - check
  - review
  - verify
```

Workflows should initially compile into agent instructions rather than being executed by Forja.

Future versions could optionally provide a workflow runtime.

---

# 12. Policy

Policies describe global development rules.

Example:

```yaml
# policies/engineering.yaml

verification:
  fast: make check
  full: make verify

rules:
  - never-disable-tests
  - avoid-unrelated-changes
  - prefer-existing-patterns
  - require-review-for-nontrivial-changes
```

These rules can feed generated:

```text
AGENTS.md
CLAUDE.md
harness instructions
```

---

# 13. Pack

A Pack is a curated dependency bundle.

Example:

```yaml
name: java-backend
version: 1.0.0

skills:
  - java@^2
  - testing@^3
  - api-design@^2
  - database-design@^1
  - distributed-systems@^2

agents:
  - reviewer@^1

workflows:
  - feature@^1
  - bugfix@^1
```

Then:

```bash
forja add pack java-backend
```

installs the collection.

Potential packs:

```text
java-backend
spring-backend
frontend
typescript
python
distributed-systems
security
ddd
startup
```

---

# 14. Configuration Model

Project configuration:

```yaml
# forja.yaml

version: 1

harnesses:
  opencode:
    enabled: true

  claude-code:
    enabled: true

  codex:
    enabled: true

agents:
  - orchestrator
  - implementer
  - reviewer

skills:
  - testing@^2
  - debugging@^1
  - code-review@^3
  - api-design@^2
  - java@^2

workflows:
  - feature
  - bugfix
  - refactor

verification:
  check: make check
  verify: make verify
```

---

# 15. Lockfile

For reproducibility Forja should generate:

```text
forja.lock
```

Example:

```yaml
lockfileVersion: 1

skills:
  testing:
    version: 2.4.1
    source: github:forja-sh/skills
    integrity: sha256-abc...

  java:
    version: 2.1.0
    source: github:forja-sh/skills
    integrity: sha256-def...
```

Two developers using the same:

```text
forja.yaml
forja.lock
```

should receive the same configuration.

---

# 16. Global Configuration

Global Forja state:

```text
~/.forja/
├── config.yaml
├── registry/
├── cache/
├── packages/
└── state/
```

Example:

```yaml
# ~/.forja/config.yaml

defaultHarnesses:
  - opencode

registries:
  official:
    url: https://github.com/forja-sh/registry

update:
  check: true
```

---

# 17. Project vs Global Scope

Forja should support:

```text
global
project
```

Global:

```bash
forja add testing --global
```

Project:

```bash
forja add testing
```

Conceptually:

```text
Global Forja config
        │
        ▼
Project Forja config
        │
        ▼
Harness adapter
```

Project configuration takes precedence where appropriate.

---

# 18. CLI

The CLI is the primary interface.

Binary:

```bash
forja
```

---

# 19. `forja init`

Initialize Forja in the current project.

```bash
forja init
```

Interactive flow:

```text
Forja

Detected:

  ✓ Git
  ✓ OpenCode
  ✓ Claude Code
  ✓ Codex

Which harnesses should Forja configure?

  ◉ OpenCode
  ◉ Claude Code
  ◉ Codex

Select starter packs:

  ◉ core-engineering
  ◉ java-backend
  ○ frontend

Verification command:

  Fast: ./gradlew test
  Full: ./gradlew check

Created:

  forja.yaml
  forja.lock

Run:

  forja sync
```

---

# 20. `forja sync`

Core command.

```bash
forja sync
```

Responsibilities:

1. Load configuration.
2. Load lockfile.
3. Resolve packages.
4. Validate schemas.
5. Build Forja intermediate representation.
6. Run adapter compatibility analysis.
7. Generate harness files.
8. Detect conflicts.
9. Write managed files.
10. Update internal state.

Example:

```text
Forja Sync

Skills
  ✓ testing@2.4.1
  ✓ java@2.1.0
  ✓ code-review@3.0.2

Harnesses

OpenCode
  ✓ 6 skills
  ✓ 3 agents
  ✓ project instructions

Claude Code
  ✓ 6 skills
  ✓ 3 agents
  ✓ project instructions

Codex
  ✓ 6 skills
  ✓ project instructions
  ! reviewer agent requires fallback strategy

Synced successfully.
```

---

# 21. `forja diff`

Show changes without writing them.

```bash
forja diff
```

Example:

```diff
OpenCode

+ .opencode/agents/reviewer.md

~ .agents/skills/testing/SKILL.md
- old instruction
+ new instruction

Claude Code

~ CLAUDE.md
```

This should be a first-class feature.

---

# 22. `forja sync --dry-run`

Equivalent behavior:

```bash
forja sync --dry-run
```

No file changes.

Exit non-zero when changes are required if used with:

```bash
forja sync --check
```

Useful for CI.

---

# 23. `forja add`

Install components.

```bash
forja add skill testing
```

Shortcut:

```bash
forja add testing
```

Version:

```bash
forja add testing@2.4.1
```

Remote Git repository:

```bash
forja add github:jnta/agent-skills/testing
```

Pack:

```bash
forja add pack java-backend
```

---

# 24. `forja remove`

```bash
forja remove testing
```

Must:

- update manifest
- update lockfile
- remove generated harness artifacts no longer needed
- preserve unrelated manual files

---

# 25. `forja update`

Update all compatible components:

```bash
forja update
```

Specific:

```bash
forja update testing
```

Preview:

```bash
forja update --dry-run
```

Output:

```text
testing       2.3.0 → 2.4.1
java          2.1.0 → 2.2.0
code-review   3.0.2 → 4.0.0  major update skipped
```

---

# 26. `forja outdated`

```bash
forja outdated
```

Output:

```text
PACKAGE       CURRENT   WANTED   LATEST

testing       2.3.0     2.4.1    2.4.1
java          2.1.0     2.2.0    3.0.0
code-review   3.0.2     3.1.0    3.1.0
```

---

# 27. `forja list`

```bash
forja list
```

Possible output:

```text
Agents
  orchestrator
  implementer
  reviewer

Skills
  api-design
  code-review
  debugging
  java
  testing

Workflows
  bugfix
  feature
  refactor
```

---

# 28. `forja doctor`

Diagnose environment and compatibility.

```bash
forja doctor
```

Example:

```text
Forja Doctor

Environment
  ✓ Node 24
  ✓ Git
  ✓ ~/.forja writable

Harnesses
  ✓ OpenCode 2.8
  ✓ Claude Code
  ✓ Codex

Configuration
  ✓ forja.yaml valid
  ✓ forja.lock valid

Compatibility
  ✓ 7 skills portable
  ! reviewer uses shell restrictions unsupported by codex adapter

Generated files
  ✓ synchronized

Status: healthy with 1 warning
```

---

# 29. `forja validate`

Validate packages and project configuration.

```bash
forja validate
```

Checks:

- schemas
- invalid skill names
- duplicate IDs
- missing dependencies
- dependency cycles
- unsupported capabilities
- malformed Markdown frontmatter
- missing referenced files
- unsafe paths
- invalid versions

---

# 30. Harness Management

Commands:

```bash
forja harness list
```

```text
HARNESS       STATUS

opencode      enabled
claude-code   enabled
codex         enabled
cursor        unavailable
```

Enable:

```bash
forja harness enable codex
```

Disable:

```bash
forja harness disable claude-code
```

Inspect:

```bash
forja harness info opencode
```

---

# 31. Adapter Architecture

Adapters are the central portability mechanism.

Interface concept:

```ts
interface HarnessAdapter {
  id: string;

  detect(): Promise<DetectionResult>;

  validate(ir: ForjaIR): Promise<Diagnostic[]>;

  compile(ir: ForjaIR): Promise<GeneratedArtifact[]>;

  inspect(project: ProjectContext): Promise<HarnessState>;
}
```

Adapters receive normalized Forja IR.

They do not parse user packages directly.

```text
Packages
   ↓
Resolver
   ↓
Forja IR
   ↓
Adapter
   ↓
Harness files
```

---

# 32. Initial Adapters

## OpenCode Adapter

Should support:

- `.agents/skills`
- `.opencode/agents`
- `AGENTS.md`
- skill permissions
- subagents
- primary agents
- harness-specific metadata

OpenCode already supports global and project skill discovery and custom agent definitions, making it a strong first adapter target. :chatgpt-content-reference{index="5"}

---

## Claude Code Adapter

Responsibilities:

- map portable skills to Claude-compatible skill locations
- generate/update Claude-specific instructions where needed
- map agents/subagents
- translate tool restrictions
- preserve user-authored Claude configuration

Claude Code also exposes programmatic CLI execution and permission controls, which may become useful for future verification or adapter tests. :chatgpt-content-reference{index="6"}

---

## Codex Adapter

Responsibilities:

- use portable skills
- generate repository instructions through `AGENTS.md`
- preserve hierarchy
- detect unsupported agent semantics
- provide graceful degradation

Codex automatically incorporates hierarchical `AGENTS.md` instructions, making repository rules a natural portable surface. :chatgpt-content-reference{index="7"}

---

# 33. Forja Intermediate Representation

Adapters should not consume raw YAML directly.

Introduce:

Forja IR

Example:

```ts
type ForjaIR = {
  agents: AgentDefinition[];
  skills: SkillDefinition[];
  workflows: WorkflowDefinition[];
  policies: PolicyDefinition[];
  verification: VerificationDefinition;
};
```

Normalized agent:

```ts
type AgentDefinition = {
  id: string;
  description: string;
  type: "primary" | "subagent";
  instructions: string;

  capabilities: {
    readFiles: boolean;
    writeFiles: boolean;
    shell: "none" | "readonly" | "full";
    network: boolean;
  };

  skills: string[];
};
```

This isolation makes adapters replaceable.

# 34. Capability Negotiation

Harnesses will never have identical capabilities.

Forja must therefore expose compatibility diagnostics.

Example:

reviewer requires:

filesystem.read
shell.readonly
filesystem.write = false

Harness A supports everything.

Harness B supports only:

shell.full
shell.none

Forja reports:

WARN FORJA-COMPAT-014

Agent reviewer requests readonly shell access.

Codex adapter cannot represent this restriction exactly.

Fallback:
shell access disabled.

Users should be able to configure strict mode:

```yaml
compatibility:
  strict: true
```

Then unsupported semantics become errors instead of warnings.

# 35. Graceful Degradation

Three states:

exact
degraded
unsupported

Example:

Reviewer → OpenCode: exact
Reviewer → Claude: exact
Reviewer → Codex: degraded

Never silently degrade security-sensitive permissions.

# 36. Registry

v1 registry can be Git-based.

No centralized server is required initially.

Default source:

github.com/forja-sh/registry

Possible structure:

```text
registry/
├── skills/
├── agents/
├── workflows/
└── packs/
```

Metadata points toward package repositories or immutable Git revisions.

Later Forja could introduce:

registry.forja.dev

without changing the package model.

# 37. Package Sources

Support progressively:

v1

local path
Git
GitHub
official registry

Examples:

```bash
forja add ./my-skill
forja add github:jnta/my-forja-skills/testing
```

Future

HTTPS registry
private registries
enterprise registries

# 38. Versioning

Use Semantic Versioning.

MAJOR
breaking behavioral/interface change

MINOR
backwards-compatible behavior addition

PATCH
clarification or bug fix

Dependency syntax:

```yaml
dependencies:
  testing: "^2.3.0"
```

# 39. Package Integrity

Every locked package should include an integrity checksum.

integrity: sha256:...

Installation must verify the resolved content.

This is especially important because skills contain instructions and may contain executable scripts.

# 40. Security Model

Skills must be treated as executable supply-chain inputs.

A malicious skill could instruct an agent to:

delete files
upload source code
read credentials
run shell commands

or contain malicious scripts.

Forja should therefore expose package risk before installation.

Example:

```text
forja add deployment-helper

Package requests:

  ✓ instructions
  ! shell scripts
  ! network access references

Source:
  github:example/deployment-helper

Install? [y/N]
```

# 41. Trust Policy

Potential manifest:

```yaml
trust:
  scripts: ask
  remoteReferences: ask
  unsignedPackages: allow
```

Future:

```yaml
trustedPublishers:
  - forja-sh
  - jnta
```

# 42. Script Execution

Forja v1 should not automatically execute package scripts during installation.

A skill may include scripts for the target agent to invoke later.

But:

forja add

must not behave like an unrestricted package lifecycle hook system.

This avoids repeating security mistakes associated with package-manager install scripts.

# 43. Managed Files

Forja must keep internal ownership metadata.

Example internal state:

```text
.forja/
└── state.json
```

The state contains:

```json
{
  "managedFiles": {
    ".opencode/agents/reviewer.md": {
      "hash": "...",
      "source": "agent:reviewer"
    }
  }
}
```

Before replacing a file:

current hash == previous generated hash

→ safe update.

Otherwise:

CONFLICT

# 44. Conflict Handling

Example:

```text
Conflict detected:

.opencode/agents/reviewer.md

The file was modified after Forja generated it.

Choose:

  [d] show diff
  [o] overwrite
  [k] keep local
  [a] abort
```

Non-interactive mode must abort safely unless explicit flags are provided.

# 45. Repository Instructions

Forja should generate a concise repository contract rather than a massive prompt.

Example:

```md
# Agent Engineering Instructions

## Workflow

For non-trivial changes:

1. Explore relevant code.
2. Plan the implementation.
3. Implement the smallest correct change.
4. Run focused validation.
5. Perform an independent review.
6. Address findings.
7. Run full verification.

## Verification

Fast:

    make check

Full:

    make verify

A task is not complete until full verification succeeds.
```

This aligns with current guidance favoring small persistent instruction files plus task-specific skills.

# 46. Recommended Built-in Agents

Forja should ship with very few built-in agents.

Orchestrator

Responsibilities:

understand
plan
delegate
integrate
verify

Implementer

Responsibilities:

implement bounded changes
run focused tests
report decisions

Reviewer

Responsibilities:

independent review
no editing
identify correctness issues
rank findings

Researcher

Optional.

Responsibilities:

documentation research
dependency research
external investigation

Do not ship dozens of agents.

# 47. Recommended Built-in Skills

Initial core library:

testing
debugging
code-review
refactoring
api-design
database-design
security-review
distributed-systems
git-workflow
documentation

Technology packs can add:

java
spring
micronaut
kafka
postgresql
typescript
react
python
go

# 48. Skill Composition

Agents should dynamically compose skills.

Example task:

Implement Kafka-based payment retry.

Relevant skill set:

java
+
kafka
+
distributed-systems
+
testing

Review:

code-review
+
kafka
+
distributed-systems

This is preferable to creating:

java-kafka-payment-retry-agent

# 49. Project Discovery

forja init should inspect the repository.

Potential detection:

```text
pom.xml        → Maven / Java
build.gradle   → Gradle / Java
package.json   → JS/TS
pyproject.toml → Python
go.mod         → Go
Cargo.toml     → Rust
```

It should suggest, not automatically install, packs.

Example:

```text
Detected:

Java 21
Gradle
Spring Boot
PostgreSQL
Kafka

Suggested packs:

  java
  spring
  postgres
  kafka
```

# 50. Verification Integration

Forja does not own the test system.

Projects declare it.

```yaml
verification:
  quick:
    command: make check

  full:
    command: make verify
```

Potential generated instructions:

During implementation:
run `make check`.

Before declaring completion:
run `make verify`.

# 51. CI Support

Forja itself should support:

```bash
forja validate
forja sync --check
```

CI example:

```yaml
- run: forja validate
- run: forja sync --check
```

This guarantees committed harness configurations match the canonical Forja configuration.

# 52. Suggested Technology Stack

Language

TypeScript

Recommendation:

TypeScript 5+
Node.js 22+

Reasons:

excellent CLI ecosystem

strong cross-platform support

easy global installation

npm distribution

simple filesystem APIs

excellent YAML/JSON tooling

appropriate for configuration-heavy software

low contribution barrier

easy harness adapter development

Forja is primarily:

configuration parsing
filesystem transformations
dependency resolution
CLI UX
Git interactions

rather than CPU-intensive software.

TypeScript fits extremely well.

# 53. Runtime

Target standard Node.js rather than requiring Bun.

Developers may use:

pnpm

for Forja development.

But the distributed CLI should require only Node.

This maximizes portability.

# 54. Package Manager

Recommended:

pnpm

with workspaces.

# 55. Repository Architecture

Recommended monorepo:

```text
forja/
├── apps/
│   └── cli/
│
├── packages/
│   ├── core/
│   ├── schema/
│   ├── resolver/
│   ├── registry/
│   ├── adapter-sdk/
│   │
│   ├── adapter-opencode/
│   ├── adapter-claude/
│   ├── adapter-codex/
│   │
│   └── testing/
│
├── skills/
├── agents/
├── packs/
│
├── docs/
├── examples/
│
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

# 56. Build Tooling

Recommended:

tsup

or:

tsdown

for CLI bundling.

Avoid shipping a giant dependency tree if possible.

# 57. CLI Framework

Recommended:

Commander.js

or:

citty

Recommendation for v1:

Commander.js

because it is boring, stable, familiar, and sufficient.

# 58. Interactive CLI

Recommended:

@clack/prompts

for:

harness selection

confirmation

setup wizard

conflict resolution

Keep commands fully usable without interaction for CI.

# 59. Schema Validation

Recommended:

Zod

All canonical configuration should parse into typed domain objects.

YAML
 ↓
Zod
 ↓
Domain model
 ↓
IR

# 60. YAML

Recommended:

yaml

npm library.

Use YAML for user-facing configuration.

Use JSON internally where appropriate.

# 61. Git Operations

Prefer invoking the installed:

git

binary through a safe process wrapper instead of implementing Git behavior.

Forja should not require libgit bindings.

# 62. Process Execution

Recommended:

execa

for controlled cross-platform subprocess execution.

# 63. Logging

Keep normal output human-oriented.

Provide:

forja sync --json

for automation.

Support:

--quiet
--verbose
--debug

# 64. Testing Strategy

Unit tests

Test:

parsing

schemas

dependency resolver

semver

capability negotiation

conflict detection

Recommended:

Vitest

Adapter Contract Tests

Every adapter must satisfy the same test suite.

Example:

given normalized reviewer agent
when compiled
then required semantic constraints are preserved

Golden File Tests

Extremely important.

Input:

Forja IR

Expected output:

fixture/opencode/
fixture/claude/
fixture/codex/

Compiler output gets diffed against committed fixtures.

Integration Tests

Use temporary repositories.

create temp repo
↓
forja init
↓
forja add
↓
forja sync
↓
verify generated files
↓
forja update
↓
verify diff

End-to-End Tests

Install packaged CLI into an isolated environment and execute real commands.

# 65. Adapter Test Fixtures

Each adapter should contain examples such as:

minimal
all-skills
reviewer-readonly
nested-instructions
conflicting-files
unsupported-capability

# 66. Architecture Boundaries

Core should know nothing about OpenCode.

Bad:

```ts
if (harness === "opencode") {
}
```

inside core.

Good:

Core → HarnessAdapter

All harness branching belongs in adapters.

# 67. Plugin Architecture

Future harness adapters should be installable.

Example:

forja adapter add @community/forja-cursor

Possible package contract:

```ts
export default defineAdapter({
  id: "cursor",
  ...
});
```

This makes Forja itself extensible.

# 68. Adapter SDK

Publish:

@forja/adapter-sdk

Containing:

TypeScript interfaces

schemas

testing utilities

capability vocabulary

golden fixture helpers

# 69. Capability Vocabulary

Forja needs a small stable abstraction layer.

Example:

filesystem.read
filesystem.write
shell.none
shell.readonly
shell.full
network
skills
subagents
primary-agents
mcp

Do not model every proprietary feature.

Adapters may expose extensions.

# 70. Harness Extensions

Example:

```yaml
extensions:
  opencode:
    model: anthropic/claude-sonnet
```

or inside agent metadata:

```yaml
harness:
  opencode:
    mode: subagent

  claude-code:
    model: sonnet
```

Portable semantics stay outside this block.

# 71. Configuration Precedence

Recommended precedence:

Forja defaults
    ↓
global config
    ↓
pack configuration
    ↓
project forja.yaml
    ↓
local uncommitted config

Optional:

forja.local.yaml

Should normally be included in .gitignore.

# 72. Distribution

Publish CLI as:

@forja/cli

Installation:

npm install -g @forja/cli

Also potentially:

pnpm add -g @forja/cli

Future:

Homebrew
Scoop
standalone executable

# 73. Developer Experience

Desired first-run experience:

```text
$ forja init

 🔥 Forja

Portable tooling for AI coding agents.

Detected:
  OpenCode
  Claude Code
  Codex

Select harnesses:
  ◉ OpenCode
  ◉ Claude Code
  ◉ Codex

Detected stack:
  Java
  Gradle
  Spring Boot

Suggested skills:
  ◉ testing
  ◉ debugging
  ◉ code-review
  ◉ java
  ◉ spring

Create configuration? yes

✓ forja.yaml
✓ forja.lock

Run `forja sync` to generate harness configuration.
```

# 74. Example End-to-End Workflow

User installs:

npm install -g @forja/cli

Creates project:

cd payments-api
forja init

Adds:

forja add pack java-backend
forja add kafka

Configuration becomes:

```yaml
skills:
  - java
  - testing
  - debugging
  - code-review
  - api-design
  - database-design
  - kafka

agents:
  - reviewer
  - implementer
```

Run:

forja sync

Output:

```text
OpenCode
  + .opencode/agents/reviewer.md
  + .opencode/agents/implementer.md

Shared
  + .agents/skills/testing/SKILL.md
  + .agents/skills/debugging/SKILL.md
  + .agents/skills/java/SKILL.md
  + AGENTS.md

Claude
  + generated Claude integration

Codex
  ✓ uses shared Agent Skills
  ✓ uses AGENTS.md
```

Later:

forja outdated

testing   2.3.0 → 2.4.0
java      1.4.0 → 1.5.0

Then:

forja update
forja diff
forja sync

Done.

# 75. Global Personal Setup

A major Forja use case should be:

forja add --global pack my-engineering

Then any new repository can start with:

forja init

and inherit the developer's preferred:

review methodology
testing rules
debugging workflow
agent configuration

This solves the "configure every new repository again" problem.

# 76. Export / Import

Export personal setup:

forja export > forja-profile.yaml

Import:

forja import forja-profile.yaml

Future:

forja profile use backend

Profiles:

personal
backend
frontend
security
minimal

# 77. Authoring Commands

Later v1.x could include:

forja create skill

forja create agent

forja create pack

Example:

```text
Skill name: kafka
Description: Guidance for Kafka event-driven systems

Created:

skills/kafka/
├── SKILL.md
└── skill.yaml
```

# 78. Linting

Forja should include:

forja lint

Potential diagnostics:

WARN skill/testing

Description is too generic.

Current:
"Helps with testing."

Suggested:
"Designs and validates unit, integration, and regression tests for software changes."

This matters because skill descriptions influence automatic skill selection by agents. OpenAI's current skill guidance specifically emphasizes name and description as primary selection signals.

# 79. Evals — Future Direction

Eventually Forja should allow packages to include evals.

Example:

```text
skills/
└── testing/
    ├── SKILL.md
    └── evals/
        ├── should-trigger.yaml
        └── should-not-trigger.yaml
```

Possible command:

forja eval testing

This allows skill authors to measure:

trigger reliability
instruction adherence
task quality

rather than judging skills entirely by intuition.

Systematic evaluation of agent skills is already becoming an important development practice.

# 80. Telemetry

Default recommendation:

disabled

If later introduced:

explicit opt-in

no prompt contents

no repository contents

no file names

anonymous CLI feature usage only

Trust is particularly important for a tool controlling agent configuration.

# 81. Error Design

Errors should be actionable.

Bad:

Configuration invalid.

Good:

FORJA-102

Skill "code-review" requires "testing@^2",
but project locks testing@1.8.0.

Fix:

  forja update testing

or change:

  code-review: 2.x

Every significant error should have:

code
problem
cause
suggested resolution

# 82. Performance

Target:

forja validate < 300 ms
forja diff     < 500 ms
forja sync     < 1 s

for ordinary local projects excluding network dependency downloads.

Forja should feel instant.

# 83. Offline Support

After dependencies have been resolved once:

forja sync

should work offline from the local cache.

Potential:

forja sync --offline

# 84. MVP

The MVP should be intentionally smaller than the complete vision.

MVP functionality

CLI

forja init
forja add
forja remove
forja list
forja sync
forja diff
forja validate
forja doctor

Domain

skills
agents
policies

Sources

local
GitHub
built-in registry

Harnesses

OpenCode
Claude Code
Codex

Package management

semantic versions
lockfile
integrity hash

Safety

conflict detection
dry-run
managed file tracking

# 85. Explicitly Exclude from MVP

Do not initially build:

web marketplace
accounts
cloud sync
agent runtime
workflow execution engine
AI-generated skills
team dashboard
analytics
remote execution
automatic evals
private registry service

# 86. Development Phases

Phase 0 — Foundation

Build:

CLI
schemas
domain model
Forja IR
filesystem abstraction
managed file tracking

Goal:

forja init
forja validate

Phase 1 — Portable Skills

Build:

skill loader
Agent Skills compatibility
local packages
Git packages
lockfile

Goal:

forja add testing
forja sync

Skills are the ideal first primitive because they already have meaningful cross-harness convergence.

Phase 2 — Harness Adapters

Implement:

OpenCode
Claude Code
Codex

Start with OpenCode because its agent and skill representation is particularly explicit.

Phase 3 — Agents

Introduce canonical agent semantics.

reviewer
implementer
orchestrator

Implement capability negotiation and degradation reporting.

Phase 4 — Registry / Updates

Add:

forja update
forja outdated
registry
integrity
dependency resolution

Phase 5 — Packs

Add:

core-engineering
java-backend
frontend
distributed-systems

Phase 6 — Ecosystem

Introduce:

adapter SDK
community adapters
authoring tools
skill linting
eval framework

# 87. Proposed v0.1 Repository

```text
forja/
│
├── apps/
│   └── cli/
│
├── packages/
│   ├── core/
│   ├── schemas/
│   ├── resolver/
│   ├── adapter-sdk/
│   ├── adapter-opencode/
│   ├── adapter-claude/
│   └── adapter-codex/
│
├── catalog/
│   ├── agents/
│   │   ├── implementer/
│   │   └── reviewer/
│   │
│   ├── skills/
│   │   ├── testing/
│   │   ├── debugging/
│   │   └── code-review/
│   │
│   └── packs/
│       └── core-engineering/
│
├── examples/
│   ├── java/
│   ├── typescript/
│   └── multi-harness/
│
├── docs/
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

# 88. Initial Engineering Architecture

```text
                 CLI
                  │
                  ▼
            Application Layer
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
    Resolver    Registry    Project
       │                     │
       └──────────┬──────────┘
                  ▼
                Core
                  │
                  ▼
              Forja IR
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
    OpenCode    Claude     Codex
     Adapter    Adapter    Adapter
        │         │         │
        └─────────┼─────────┘
                  ▼
            File Planner
                  │
                  ▼
           Conflict Engine
                  │
                  ▼
             Filesystem
```

Important distinction:

Adapters should produce a desired file plan.

They should not write files directly.

Example:

```ts
type FileOperation =
  | CreateFile
  | UpdateFile
  | DeleteManagedFile;
```

Then:

Adapter
   ↓
Desired state
   ↓
Diff
   ↓
Conflict detection
   ↓
Filesystem write

This makes:

forja diff
forja sync
forja sync --dry-run

share almost all implementation logic.

# 89. Definition of Done for v1

Forja v1 is ready when a user can:

```bash
npm install -g @forja/cli

mkdir example
cd example

forja init

forja add pack core-engineering

forja harness enable opencode
forja harness enable claude-code
forja harness enable codex

forja sync
```

and receive valid configurations for all selected harnesses.

Then:

forja update

must safely upgrade the installed definitions.

And:

forja sync --check

must verify reproducibility in CI.

# 90. Product Success Metrics

Initially focus on technical adoption metrics rather than revenue.

Useful measures:

Portability

% of core packages usable without harness-specific metadata

Target:

>80%

Synchronization correctness

idempotent sync rate

Target:

100%

Compatibility

supported canonical features represented exactly across all Tier-1 adapters

Target:

>90%

Setup

A developer should be able to configure a new repository using an existing profile with:

≤3 commands

Example:

forja init
forja add pack java-backend
forja sync

Safety

Forja must have zero known cases where:

forja sync

silently overwrites user-modified unmanaged configuration.

# 91. Key Product Risks

Harness APIs change frequently

Mitigation:

adapter isolation
adapter contract tests
version compatibility tables

Lowest-common-denominator design

Trying to make everything portable could eliminate powerful harness features.

Mitigation:

portable core
+
harness extensions

Overengineering the agent model

Mitigation:

Start with:

skills
agents
policies

before adding complex workflow execution.

Skill supply-chain attacks

Mitigation:

checksums
source visibility
no installation scripts
trust policies
future signing

Generated-file conflicts

Mitigation:

ownership hashes
dry-run
diff
explicit conflict handling

# 92. Strategic Differentiation

Forja should not compete with coding agents.

It should sit one layer above them.

```text
          Developer methodology
                   │
                   ▼
                 FORJA
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
    OpenCode     Claude      Codex
        │          │          │
        ▼          ▼          ▼
      Models      Models     Models
```

That positioning is important.

A user changing from Claude Code to OpenCode should not need to abandon:

their skills
their review process
their workflows
their verification methodology
their preferred agents

Only the runtime changes.

# 93. Long-Term Vision

Forja could eventually become the ecosystem layer for portable agent engineering.

A developer could have:

~/.forja/profile.yaml

containing years of accumulated development methodology.

A new machine:

npm install -g @forja/cli

forja profile install github:jnta/forja-profile

forja sync

and their entire agent development environment returns.

A team could publish:

acme/backend-engineering

containing:

security policies
review methodology
API conventions
testing workflows
architecture rules
company skills
agent roles

Employees could use:

OpenCode
Claude Code
Codex
future harnesses

without the company rewriting its engineering methodology for each one.

# 94. Core Mental Model

The easiest way to explain Forja should be:

npm manages code dependencies.

Forja manages agent capabilities.

Or more precisely:

Forja is a package manager and portability layer for AI coding-agent configuration.

The user defines their engineering system once:

skills
+
agents
+
policies
+
workflows

Forja adapts it to whatever agent harness they choose.

# 95. Recommended Initial Product Scope

If development starts today, prioritize this exact sequence:

1. CLI skeleton
2. forja.yaml schema
3. Skill representation
4. Forja IR
5. managed-file engine
6. OpenCode adapter
7. Codex adapter
8. Claude adapter
9. forja init
10. forja sync
11. forja diff
12. forja validate
13. lockfile
14. Git package source
15. update/outdated
16. agents
17. packs

Do not start by implementing:

marketplace
workflow runtime
cloud backend
AI orchestration

The central technical hypothesis that should be validated first is:

Can one canonical skill/agent configuration be safely compiled into several real-world agent harnesses without making the portable representation useless?

If Forja proves that, everything else can be built on top of it.

# 96. Initial Technology Decision Summary

| Area | Decision |
| --- | --- |
| Language | TypeScript |
| Runtime | Node.js 22+ |
| Package manager | pnpm |
| Monorepo | pnpm workspaces |
| CLI | Commander.js |
| Interactive prompts | @clack/prompts |
| Schema validation | Zod |
| YAML | yaml |
| Process execution | execa |
| Semver | semver |
| Testing | Vitest |
| Build | tsup/tsdown |
| Distribution | npm |
| Canonical skill format | Agent Skills / SKILL.md |
| Project config | forja.yaml |
| Lockfile | forja.lock |
| Portable instructions | AGENTS.md where supported |
| Adapter architecture | Plugin/interface based |
| Initial registry | Git/GitHub |
| CI validation | forja validate, forja sync --check |

# 97. One-Sentence Product Definition

Forja lets developers define their AI engineering workflow once and use it across any coding-agent harness.

