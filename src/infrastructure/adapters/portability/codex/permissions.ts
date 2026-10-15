import type { HarnessCapabilities } from "@/domain/capabilities";

export const CODEX_CAPABILITIES: HarnessCapabilities = {
  id: "codex",
  // Codex custom agents inherit the parent sandbox; they can disable the shell
  // tool but cannot enforce read-only files or offline network.
  readFiles: false,
  writeFiles: false,
  network: false,
  shellNone: true,
  shellFull: true,
  shellReadonly: false,
  agents: true,
};
