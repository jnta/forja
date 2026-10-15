import { execa } from "execa";
import { describe, expect, it } from "vitest";

/**
 * Native-format smoke test. Runs only when an OpenCode binary is installed; the
 * discovered version is the evidence recorded in ADR 0005.
 */
describe("OpenCode native smoke test", () => {
  it("reports an installed OpenCode version when available", async () => {
    let version = "";
    try {
      version = (await execa("opencode", ["--version"])).stdout.trim();
    } catch {
      // No harness installed in this environment: nothing to verify.
      return;
    }

    expect(version).toMatch(/v?\d+\.\d+\.\d+/);
  });
});
