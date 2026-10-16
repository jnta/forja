import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "tsup";

const rootManifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };

/**
 * Standalone CLI build. Produces a single self-contained ESM bundle with no
 * runtime dependencies; see docs/decisions/0001-cli-foundation.md.
 */
export default defineConfig({
  entry: { cli: "src/cli/index.ts" },
  outDir: "packages/cli/dist",
  format: ["esm"],
  outExtension: () => ({ js: ".js" }),
  platform: "node",
  target: "node22",
  bundle: true,
  // zod lives in the app's dependencies, so mark it for bundling to keep the
  // published CLI dependency-free.
  noExternal: ["zod"],
  shims: true,
  banner: {
    // Commander is CJS; provide `require` so esbuild's dynamic-require shim works
    // in the ESM bundle.
    js: "import { createRequire as __forjaCreateRequire } from 'node:module'; const require = __forjaCreateRequire(import.meta.url);",
  },
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  define: {
    __FORJA_CLI_VERSION__: JSON.stringify(rootManifest.version),
  },
});
