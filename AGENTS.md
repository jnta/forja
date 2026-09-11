<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Architecture

This project follows a layered (ports & adapters) architecture. Dependencies point **inward only**: `app → container → application → domain`, with `infrastructure` plugged in at the composition root. Never import outward from an inner layer.

## Layers

- **`src/domain/`** — Contracts only. Plain TypeScript interfaces and types (`LLMEnginePort`, `CodingHarnessPort`, `ProjectState`, `LLMMessage`). No imports from Next.js, LangGraph, OpenCode, or any database/tooling driver. These are the boundaries that protect the core if we swap tools.

- **`src/application/`** — Agent behaviors and LangGraph state graphs (`software-team.graph.ts`). Receives adapters via dependency injection (`createSoftwareTeamGraph({ llm, harness })`); never imports a concrete adapter or Next.js.

- **`src/infrastructure/`** — The messy, low-level technical integrations. Concrete adapters that implement domain ports (e.g. `adapters/opencode/llm-engine.adapter.ts`, `adapters/opencode/coding-harness.adapter.ts`). To swap the execution tool, add a new adapter under `adapters/` — `domain/` and `application/` stay untouched.

- **`src/app/`** — The presentation layer: Next.js routes, React UI, and server handlers. Server actions and route handlers import the pre-configured workflow from `container.ts` and run it. Colocate UI/components/handlers inside the `app` directory using private folders (`_components/`, `_handlers/`, etc.) so they are opted out of routing.

- **`src/container.ts`** — Composition root. The single place that binds abstract contracts to concrete implementations (e.g. `new OpenCodeLlmEngine()` and `new OpenCodeCodingHarness()` → `createSoftwareTeamGraph`). This is the only file allowed to know both sides.

## OpenCode adapter: two modes

A single OpenCode server backs both modes, differing only in what the agent is allowed to touch:

- **Engineers (backend, frontend, QA)** — `CodingHarnessPort`. `OpenCodeCodingHarness` runs the `forja-engineer` agent with tools enabled, scoped to `OPENCODE_WORKSPACE`, so the agent reads files, writes code and runs commands.
- **Orchestrator (PO/PM/router)** — `LLMEnginePort`. `OpenCodeLlmEngine` runs the `forja-orchestrator` agent with tools disabled (per-message `tools` map plus `permission: deny` in `opencode.json`) as a pure text-in/text-out decision engine.

The server is external: run `opencode serve` from this repo so `opencode.json` (the `forja-orchestrator`/`forja-engineer` agent definitions) loads, and point the app at it with `OPENCODE_SERVER_URL`.

## Rules

- `domain` imports nothing from the other layers (and no third-party frameworks).
- `application` depends on `domain` contracts, never on `infrastructure` or `app`.
- `infrastructure` may depend on `domain` and third-party SDKs; it must implement domain ports.
- `app` depends on `container` (and `domain` types), never on `infrastructure` directly.
- If a layer needs a capability, add a port in `domain` and an adapter in `infrastructure`; wire it in `container.ts`.
