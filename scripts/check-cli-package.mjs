#!/usr/bin/env node
// Verifies the standalone CLI package: only intended assets are packed and the
// bundle contains no web/runtime dependencies or secret material.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cliDir = path.join(fileURLToPath(new URL("..", import.meta.url)), "packages", "cli");
const entry = path.join(cliDir, "dist", "cli.js");

const report = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: cliDir }).toString(),
);
const files = report[0].files.map((file) => file.path).sort();

const allowed = (file) => file === "package.json" || file === "LICENSE" || file.startsWith("dist/");
const unexpected = files.filter((file) => !allowed(file));
if (unexpected.length > 0) {
  console.error(`Unexpected package files: ${unexpected.join(", ")}`);
  process.exit(1);
}
if (!files.includes("dist/cli.js")) {
  console.error("dist/cli.js is missing from the package");
  process.exit(1);
}

const bundle = readFileSync(entry, "utf8");
const forbidden = ["@langchain/", "@opencode-ai/", "next/dist", "react-dom"];
for (const token of forbidden) {
  if (bundle.includes(token)) {
    console.error(`Bundle must not contain "${token}"`);
    process.exit(1);
  }
}

console.log(`CLI package OK: ${files.length} file(s), bundle ${bundle.length} bytes.`);
