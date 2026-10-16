# Requirement traceability

PRD areas → implementation phases (v1 = Phases 1–10). See
[implementation-plan.md](./implementation-plan.md) for the full table and each
phase's completion record with test evidence.

| PRD area | Phases | Key artifacts |
| -------- | ------ | ------------- |
| Vision, deterministic/safe generation, v1 goals (1–7) | 1, 4–8, 10 | CLI, sync planner/writer, adapters, lifecycle |
| Five primitives and config (8–17) | 2–3, 7–9 | schemas, IR, precedence, scope |
| CLI, init, sync, diff, dry-run/check (18–22) | 1, 4–7 | `src/cli/commands/*`, `src/application/sync/*` |
| Add/remove/update/outdated/list (23–27) | 3, 8 | `src/application/packages/*` |
| Doctor/validate/harness (28–30) | 2, 6–7 | `doctor.ts`, `harness.ts`, `validate.ts` |
| Adapter contract and targets (31–32) | 4–6, 9 | `HarnessAdapterPort`, portability adapters |
| IR, capabilities, extensions, boundaries (33–35, 66, 69–70, 88) | 1–2, 4–6, 9 | `domain/ir.ts`, `domain/capabilities.ts`, `domain/tools.ts` |
| Sources, semver, integrity, trust, scripts (36–42) | 3, 8 | `resolve/*`, `domain/trust.ts` |
| Ownership/conflicts/instructions (43–45) | 4–6 | `domain/sync.ts`, `shared/instructions.ts` |
| Catalog/composition/discovery/verification (46–50) | 2, 7, 9 | `catalog/`, `discovery/stack.ts` |
| CI, technology, tests, fixtures (51–65, 96) | 1–6, 10 | `.github/workflows/ci.yml`, `src/test/*` |
| SDK/installable adapters (67–68) | 9, 12 | authoring guide, sample adapter |
| Precedence/distribution/onboarding/global (71–75) | 2, 7, 10 | scope, init, guides |
| Export/import/authoring/lint (76–78) | 11 | (planned) |
| Evals and telemetry (79–80) | 10, 12 | telemetry disabled; evals future |
| Errors/performance/offline (81–83) | 1, 3, 10 | error contract, offline mode, benchmark |
| v1 done, metrics, risks (89–91) | 4–6, 10 | compatibility matrix, completion records |

Out of v1 (section 6): hosted marketplace, agent runtime, live orchestration,
IDE, model-provider keys, universal proprietary feature translation.
