/**
 * Trust and risk model (PRD 40–42).
 *
 * Skills are executable supply-chain inputs. Before installing, Forja surfaces
 * the source, bundled scripts and remote references, then applies the trust
 * policy. Package scripts are never executed.
 */
export type TrustDecision = "ask" | "deny" | "allow";

export interface TrustPolicy {
  readonly scripts: TrustDecision;
  readonly remoteReferences: TrustDecision;
  readonly unsignedPackages: TrustDecision;
}

export const DEFAULT_TRUST_POLICY: TrustPolicy = {
  scripts: "ask",
  remoteReferences: "ask",
  unsignedPackages: "allow",
};

export interface RiskSummary {
  /** `kind:name@version`. */
  readonly package: string;
  readonly source: string;
  /** Resource paths under `scripts/`. */
  readonly scripts: readonly string[];
  /** URLs found in instructions and manifests. */
  readonly remoteReferences: readonly string[];
  /** Always true until package signing exists. */
  readonly unsigned: boolean;
}

export interface TrustConsent {
  /** Explicit, scoped consent supplied by a noninteractive caller. */
  readonly allow: boolean;
}

export interface TrustEvaluation {
  readonly allowed: boolean;
  readonly denied: readonly RiskSummary[];
  /** Packages that still need an explicit decision. */
  readonly requiresConfirmation: readonly RiskSummary[];
}
