import { z } from "zod";
import semver from "semver";

import {
  COMPONENT_NAME_PATTERN,
  componentNameList,
  harnessList,
  verificationInput,
} from "./common";

export const componentName = z
  .string()
  .regex(COMPONENT_NAME_PATTERN, "must be lowercase kebab-case");

export const exactVersion = z
  .string()
  .refine((value) => semver.valid(value) !== null, "must be a valid semver version");

/** The subset of configuration accepted from packs, policies and defaults. */
export const configContribution = z.object({
  harnesses: harnessList.optional(),
  defaultHarnesses: harnessList.optional(),
  agents: componentNameList.optional(),
  skills: componentNameList.optional(),
  workflows: componentNameList.optional(),
  policies: componentNameList.optional(),
  verification: verificationInput.optional(),
  compatibility: z.object({ strict: z.boolean().optional() }).optional(),
});

export const configSchema = configContribution.extend({
  version: z.number().int().optional(),
});

export const skillMetadataSchema = z.object({
  version: exactVersion.optional(),
  category: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  compatibility: z.record(z.string(), z.string()).optional(),
  dependencies: componentNameList.optional(),
  resources: z.array(z.string().min(1)).optional(),
});

export const skillFrontmatterSchema = z.object({
  name: componentName,
  description: z.string().min(1),
});

/** Optional frontmatter for `AGENT.md` (and other Markdown documents). */
export const documentFrontmatterSchema = z.object({
  name: componentName.optional(),
  description: z.string().min(1).optional(),
});

export const shellSchema = z.union([
  z.enum(["none", "readonly", "full"]),
  z.object({ enabled: z.boolean(), mutating: z.boolean().optional() }),
]);

export const agentSchema = z.object({
  name: componentName.optional(),
  description: z.string().min(1).optional(),
  type: z.enum(["primary", "subagent"]),
  capabilities: z.object({
    filesystem: z.object({ read: z.boolean(), write: z.boolean() }),
    shell: shellSchema,
    network: z.boolean().optional(),
  }),
  skills: componentNameList,
});

export const workflowStepSchema = z.union([
  z.string().min(1),
  z.object({ id: z.string().min(1), description: z.string().optional() }),
]);

export const workflowSchema = z.object({
  name: componentName.optional(),
  description: z.string().min(1).optional(),
  steps: z.array(workflowStepSchema).min(1),
});

export const policySchema = z.object({
  name: componentName.optional(),
  description: z.string().min(1).optional(),
  verification: verificationInput.optional(),
  rules: z.array(z.string().min(1)).default([]),
});

export const packSchema = z.object({
  name: componentName.optional(),
  version: exactVersion,
  description: z.string().min(1).optional(),
  skills: componentNameList.optional(),
  agents: componentNameList.optional(),
  workflows: componentNameList.optional(),
  policies: componentNameList.optional(),
  packs: componentNameList.optional(),
  config: configContribution.optional(),
});

export type ConfigInput = z.infer<typeof configSchema>;
export type ConfigContributionInput = z.infer<typeof configContribution>;
export type SkillMetadata = z.infer<typeof skillMetadataSchema>;
export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;
export type AgentInput = z.infer<typeof agentSchema>;
export type WorkflowInput = z.infer<typeof workflowSchema>;
export type PolicyInput = z.infer<typeof policySchema>;
export type PackInput = z.infer<typeof packSchema>;
