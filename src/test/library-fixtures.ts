import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Write a UTF-8 file, creating parent directories. */
export async function writeText(
  root: string,
  relative: string,
  contents: string,
): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

export async function createSymlink(
  root: string,
  relative: string,
  target: string,
): Promise<void> {
  const link = path.join(root, relative);
  await mkdir(path.dirname(link), { recursive: true });
  await symlink(target, link);
}

export interface SkillFixture {
  readonly frontmatter?: string;
  readonly metadata?: string;
  readonly body?: string;
  readonly files?: Readonly<Record<string, string>>;
}

export async function writeSkill(
  root: string,
  id: string,
  fixture: SkillFixture = {},
): Promise<void> {
  const frontmatter =
    fixture.frontmatter ?? `name: ${id}\ndescription: The ${id} skill.`;
  await writeText(
    root,
    `skills/${id}/SKILL.md`,
    `---\n${frontmatter}\n---\n\n${fixture.body ?? `# ${id}\n`}`,
  );
  if (fixture.metadata !== undefined) {
    await writeText(root, `skills/${id}/skill.yaml`, fixture.metadata);
  }
  for (const [relative, contents] of Object.entries(fixture.files ?? {})) {
    await writeText(root, `skills/${id}/${relative}`, contents);
  }
}

export interface AgentFixture {
  readonly name?: string;
  readonly description?: string;
  readonly type?: string;
  readonly filesystem?: string;
  readonly shell?: string;
  readonly network?: string;
  readonly skills?: string;
  readonly body?: string;
  readonly frontmatter?: string;
}

export function agentManifest(fixture: AgentFixture = {}): string {
  return [
    fixture.name !== undefined ? `name: ${fixture.name}` : null,
    fixture.description !== undefined ? `description: ${fixture.description}` : null,
    `type: ${fixture.type ?? "subagent"}`,
    "capabilities:",
    "  filesystem:",
    fixture.filesystem ?? "    read: true\n    write: false",
    "  shell:",
    fixture.shell ?? "    enabled: false",
    fixture.network !== undefined ? `  network: ${fixture.network}` : null,
    "skills:",
    fixture.skills ?? "  []",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export async function writeAgent(
  root: string,
  id: string,
  fixture: AgentFixture = {},
): Promise<void> {
  await writeText(
    root,
    `agents/${id}/agent.yaml`,
    `${agentManifest(fixture)}\n`,
  );
  const frontmatter = fixture.frontmatter;
  const body = fixture.body ?? `# ${id}\n`;
  await writeText(
    root,
    `agents/${id}/AGENT.md`,
    frontmatter === undefined ? body : `---\n${frontmatter}\n---\n\n${body}`,
  );
}

export async function writeWorkflow(
  root: string,
  id: string,
  contents: string,
): Promise<void> {
  await writeText(root, `workflows/${id}.yaml`, contents);
}

export async function writePolicy(
  root: string,
  id: string,
  contents: string,
): Promise<void> {
  await writeText(root, `policies/${id}.yaml`, contents);
}

export async function writePack(
  root: string,
  id: string,
  contents: string,
  extension = "yaml",
): Promise<void> {
  await writeText(root, `packs/${id}.${extension}`, contents);
}
