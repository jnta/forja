# Writing a harness adapter

A Forja adapter translates the harness-agnostic IR into one harness's native
configuration. It never parses user packages, never executes anything and never
writes files itself.

## The contract

Implement `HarnessAdapterPort` (`src/domain/harness-adapter.ts`):

```ts
interface HarnessAdapterPort {
  readonly id: string;
  detect(context: ProjectContext): Promise<HarnessDetection>;
  validate(ir: ForjaIr, context: ProjectContext): Promise<readonly Diagnostic[]>;
  compile(ir: ForjaIr, context: ProjectContext): Promise<readonly GeneratedArtifact[]>;
  inspect(context: ProjectContext): Promise<HarnessState>;
}
```

- `id`: lowercase kebab-case, not in `RESERVED_ADAPTER_IDS`. Call
  `validateAdapterId(id)` in the constructor.
- `compile`: return a desired set of artifacts (`path` absolute, `kind`,
  `contents`, optional `merge`). The safe sync writer diffs, owns and applies
  them; adapters never write.
- `validate`: report capability/declaration diagnostics
  (`analyzeCapabilities`, `capabilityDiagnostics`, `declarationDiagnostics`).
- `context.scope`: `"project"` or `"global"`; use
  `shared/locations.ts` helpers for native paths.

## Rules

- Do not import `execa`, `node:child_process`, `@langchain/*` or
  `@opencode-ai/*` — compiler adapters are pure configuration generators.
- Preserve user-owned configuration: never emit the harness's main config file
  (`opencode.json`, `settings.json`, `config.toml`). Use managed blocks for
  shared instruction files (`composeManagedFile`).
- Reuse `shared/skills.ts` and `shared/instructions.ts` so shared outputs are
  byte-identical across harnesses and deduplicate instead of conflicting.
- Declarations (tools/MCP) fall back to instructions; never copy credential
  values.
- Keep output deterministic (sort collections).

## Sample

`src/infrastructure/adapters/portability/sample/sample-adapter.ts` is a complete
minimal adapter. Register an adapter by adding it to the `adapters` array in
`src/cli/container.ts`; no domain or application code changes are required.

## Testing

- Add a golden test for each artifact.
- Run the shared contract suite (`portability/contract.test.ts`) by adding the
  adapter to its `SPECS`.
- Cover a degraded/unsupported capability and an escaping artifact path.
