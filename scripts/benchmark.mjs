#!/usr/bin/env node
// Benchmarks validate / diff / sync on an ordinary local fixture, excluding
// network downloads. Targets (PRD 82): validate < 300ms, diff < 500ms, sync < 1s.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cli = path.join(repoRoot, "packages", "cli", "dist", "cli.js");

execFileSync("npm", ["run", "cli:build"], { cwd: repoRoot, stdio: "ignore" });

const work = mkdtempSync(path.join(tmpdir(), "forja-bench-"));
const project = path.join(work, "project");
const home = path.join(work, "home");
mkdirSync(path.join(project, ".forja", "skills", "testing"), { recursive: true });
mkdirSync(path.join(project, ".forja", "agents", "implementer"), { recursive: true });
mkdirSync(home, { recursive: true });

writeFileSync(
  path.join(project, ".forja", "skills", "testing", "SKILL.md"),
  "---\nname: testing\ndescription: Testing skill.\n---\n\n# Testing\n",
);
writeFileSync(
  path.join(project, ".forja", "agents", "implementer", "agent.yaml"),
  "description: Implements.\ntype: subagent\ncapabilities:\n  filesystem:\n    read: true\n    write: true\n  shell:\n    enabled: true\n    mutating: true\n  network: true\nskills:\n  - testing\n",
);
writeFileSync(path.join(project, ".forja", "agents", "implementer", "AGENT.md"), "# Implementer\n");
writeFileSync(
  path.join(project, "forja.yaml"),
  "version: 1\nharnesses:\n  - opencode\n  - claude-code\n  - codex\nverification:\n  check: make check\n  verify: make verify\n",
);

const env = { ...process.env, HOME: home, FORJA_HOME: path.join(home, ".forja") };
const run = (args) => {
  const start = process.hrtime.bigint();
  execFileSync(process.execPath, [cli, ...args], { cwd: project, env, stdio: "ignore" });
  return Number(process.hrtime.bigint() - start) / 1e6;
};

const validate = run(["validate"]);
const diff = run(["diff"]);
const sync = run(["sync"]);
const sync2 = run(["sync"]);

const report = {
  validate: Math.round(validate),
  diff: Math.round(diff),
  sync: Math.round(sync),
  syncResync: Math.round(sync2),
  targets: { validate: 300, diff: 500, sync: 1000 },
};
console.log(JSON.stringify(report, null, 2));
rmSync(work, { recursive: true, force: true });
