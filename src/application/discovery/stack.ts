import type { FilesystemPort } from "@/domain/filesystem";

export type StackId = "maven" | "gradle" | "node" | "python" | "go" | "rust";

export interface DetectedStack {
  readonly id: StackId;
  readonly label: string;
  /** Marker files that were found. */
  readonly files: readonly string[];
  /** Packs Forja suggests (never installs automatically). */
  readonly suggestedPacks: readonly string[];
}

interface Signature {
  readonly id: StackId;
  readonly label: string;
  readonly files: readonly string[];
  readonly packs: readonly string[];
}

const SIGNATURES: readonly Signature[] = [
  { id: "maven", label: "Maven / Java", files: ["pom.xml"], packs: ["java-backend"] },
  {
    id: "gradle",
    label: "Gradle / Java",
    files: ["build.gradle", "build.gradle.kts"],
    packs: ["java-backend"],
  },
  { id: "node", label: "Node.js / TypeScript", files: ["package.json"], packs: ["typescript", "frontend"] },
  { id: "python", label: "Python", files: ["pyproject.toml", "requirements.txt"], packs: ["python"] },
  { id: "go", label: "Go", files: ["go.mod"], packs: ["go"] },
  { id: "rust", label: "Rust", files: ["Cargo.toml"], packs: ["rust"] },
];

/** Detect project stacks from marker files (PRD 49). */
export async function discoverStack(
  filesystem: FilesystemPort,
  directory: string,
): Promise<DetectedStack[]> {
  const detected: DetectedStack[] = [];
  for (const signature of SIGNATURES) {
    const found: string[] = [];
    for (const file of signature.files) {
      if (await filesystem.exists(filesystem.resolve(directory, file))) {
        found.push(file);
      }
    }
    if (found.length > 0) {
      detected.push({
        id: signature.id,
        label: signature.label,
        files: found,
        suggestedPacks: signature.packs,
      });
    }
  }
  return detected;
}
