import { CODES } from "@/domain/diagnostics";
import type { FilesystemPort } from "@/domain/filesystem";
import type { HarnessAdapterPort, ProjectContext } from "@/domain/harness-adapter";
import type { YamlParserPort } from "@/domain/serialization";

import { resolveScope, type Scope } from "../scope";
import { runSync } from "./sync";

export interface DoctorDeps {
  readonly filesystem: FilesystemPort;
  readonly yaml: YamlParserPort;
  readonly adapters: readonly HarnessAdapterPort[];
  readonly nodeVersion: string;
}

export interface DoctorOptions {
  readonly scope: Scope;
  readonly projectDir: string;
  readonly globalDir: string;
  readonly homeDir: string;
}

export type CheckStatus = "ok" | "warning" | "error";

export interface DoctorCheck {
  readonly id: string;
  readonly status: CheckStatus;
  readonly message: string;
}

export interface DoctorReport {
  readonly checks: readonly DoctorCheck[];
  readonly healthy: boolean;
  readonly warnings: number;
  readonly errors: number;
}

/**
 * Read-only environment and compatibility diagnostics (PRD 28). Doctor never
 * repairs anything: it only inspects the environment, the configuration and the
 * current sync state.
 */
export async function runDoctor(
  deps: DoctorDeps,
  options: DoctorOptions,
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const { filesystem } = deps;
  const scopePaths = resolveScope(options);

  const major = Number(deps.nodeVersion.replace(/^v/, "").split(".")[0]);
  checks.push({
    id: "env.node",
    status: major >= 22 ? "ok" : "error",
    message:
      major >= 22
        ? `Node ${deps.nodeVersion}`
        : `Node ${deps.nodeVersion} (>= 22 required)`,
  });

  const gitDir = filesystem.resolve(options.projectDir, ".git");
  const hasGit = await filesystem.exists(gitDir);
  checks.push({
    id: "env.git",
    status: hasGit ? "ok" : "warning",
    message: hasGit ? "Git repository detected" : "No Git repository detected",
  });

  const globalExists = await filesystem.exists(options.globalDir);
  const writable = await filesystem.isWritable(
    globalExists ? options.globalDir : options.homeDir,
  );
  checks.push({
    id: "env.home",
    status: writable ? "ok" : "error",
    message: writable
      ? `${globalExists ? options.globalDir : options.homeDir} is writable`
      : `${globalExists ? options.globalDir : options.homeDir} is not writable`,
  });

  checks.push({
    id: "env.telemetry",
    status: "ok",
    message: "Telemetry disabled",
  });

  const context: ProjectContext = {
    projectDir: options.projectDir,
    globalDir: options.globalDir,
    homeDir: options.homeDir,
    scope: scopePaths.scope,
  };
  for (const adapter of deps.adapters) {
    const detection = await adapter.detect(context);
    checks.push({
      id: `harness.${adapter.id}`,
      status: detection.installed ? "ok" : "warning",
      message: `${adapter.id}: ${detection.evidence}`,
    });
  }

  const report = await runSync(
    { filesystem, yaml: deps.yaml, adapters: deps.adapters },
    {
      paths: { projectDir: options.projectDir, globalDir: options.globalDir },
      scope: options.scope,
      mode: "dry-run",
    },
  );

  const configErrors = report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  checks.push({
    id: "config",
    status: configErrors.length > 0 ? "error" : "ok",
    message:
      configErrors.length > 0
        ? `${configErrors.length} configuration error(s)`
        : "Configuration valid",
  });

  const compatibility = report.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code === CODES.compatDegraded ||
      diagnostic.code === CODES.compatUnsupported,
  );
  checks.push({
    id: "compatibility",
    status: compatibility.some((diagnostic) => diagnostic.severity === "error")
      ? "error"
      : compatibility.length > 0
        ? "warning"
        : "ok",
    message:
      compatibility.length > 0
        ? `${compatibility.length} compatibility notice(s)`
        : "No compatibility issues",
  });

  checks.push({
    id: "generated",
    status: report.plan.changes > 0 ? "warning" : "ok",
    message:
      report.plan.changes > 0
        ? `${report.plan.changes} generated file(s) out of sync`
        : "Generated files synchronized",
  });

  const warnings = checks.filter((check) => check.status === "warning").length;
  const errors = checks.filter((check) => check.status === "error").length;
  return { checks, healthy: errors === 0, warnings, errors };
}
