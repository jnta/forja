import { stringify } from "yaml";

import type { FilesystemPort } from "@/domain/filesystem";
import type { GeneratedArtifact } from "@/domain/harness-adapter";
import type { SkillDefinition } from "@/domain/ir";

/**
 * Portable Agent Skills rendering shared by OpenCode and Codex (both read
 * `.agents/skills`). Rendering only portable fields keeps the artifact
 * byte-identical across harnesses so combined syncs deduplicate instead of
 * conflicting.
 */
export function renderSkill(skill: SkillDefinition): string {
  const frontmatter = { name: skill.id, description: skill.description };
  const yaml = stringify(frontmatter, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${skill.instructions.trim()}\n`;
}

/** Build `SKILL.md` plus bundled resource artifacts under `skillsDir`. */
export async function skillArtifacts(
  filesystem: FilesystemPort,
  skillsDir: string,
  skill: SkillDefinition,
): Promise<GeneratedArtifact[]> {
  const base = filesystem.resolve(skillsDir, skill.id);
  const artifacts: GeneratedArtifact[] = [
    {
      path: filesystem.resolve(base, "SKILL.md"),
      kind: "skill",
      contents: renderSkill(skill),
    },
  ];

  if (skill.directory) {
    for (const resource of skill.resources) {
      const source = filesystem.resolve(skill.directory, resource);
      try {
        artifacts.push({
          path: filesystem.resolve(base, resource),
          kind: "resource",
          contents: await filesystem.readFile(source),
        });
      } catch {
        // Missing resources are reported during validation.
      }
    }
  }

  return artifacts;
}
