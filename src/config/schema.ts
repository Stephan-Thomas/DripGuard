import { z } from 'zod';

export const ExceptionReasonSchema = z.object({
  reason: z.string().optional()
});

export const AllowedUnfundedSchema = z.union([
  z.array(z.string()),
  z.record(z.string(), z.union([ExceptionReasonSchema, z.string()])),
  z.null(),
  z.undefined()
]).transform((val) => {
  const result: Record<string, { reason?: string }> = {};
  if (!val) return result;
  if (Array.isArray(val)) {
    for (const item of val) {
      result[item] = { reason: 'Configured in allowed_unfunded' };
    }
  } else {
    for (const [key, entry] of Object.entries(val)) {
      if (typeof entry === 'string') {
        result[key] = { reason: entry };
      } else {
        result[key] = { reason: entry.reason || 'Configured in allowed_unfunded' };
      }
    }
  }
  return result;
});

export const ProjectConfigSchema = z.object({
  github: z.string().min(1, 'Project github must be "owner/repo"'),
  forge: z.enum(['github', 'gitlab']).default('github').optional(),
  name: z.string().optional(),
  url: z.string().optional()
});

export const DependenciesConfigSchema = z.object({
  include: z.array(z.enum(['runtime', 'direct', 'transitive', 'dev'])).default(['runtime', 'direct']),
  exclude: z.array(z.enum(['dev', 'optional', 'transitive'])).default(['dev', 'optional']),
  ecosystems: z.array(z.enum(['npm', 'cargo', 'go', 'pypi'])).optional(),
  workspaces: z.array(z.string()).optional()
}).default({});

export const FundingConfigSchema = z.object({
  minimum_dependency_coverage: z.number().min(0).max(100).default(90),
  minimum_direct_dependency_coverage: z.number().min(0).max(100).optional(),
  max_single_recipient_share: z.number().min(0).max(100).default(70).optional(),
  max_concentration_hhi: z.number().min(0).max(10000).default(2500).optional(),
  project_thresholds: z.record(z.string(), z.number()).default({ default: 0 }).optional()
}).default({});

export const PolicyConfigSchema = z.object({
  fail_on: z.array(z.string()).default(['new_unfunded_dependency', 'insufficient_coverage']),
  warn_on: z.array(z.string()).default(['stale_funding', 'unresolved_dependency', 'concentration']),
  strict: z.boolean().default(false).optional()
}).default({});

export const ExceptionsConfigSchema = z.object({
  allowed_unfunded: AllowedUnfundedSchema.default([]),
  ignored_projects: z.array(z.string()).default([])
}).default({});

export const ManualResolutionItemSchema = z.union([
  z.string().transform(s => ({
    github: s,
    gitlab: undefined as string | undefined,
    url: undefined as string | undefined,
    project: undefined as { github?: string; gitlab?: string } | undefined
  })),
  z.object({
    github: z.string().optional(),
    gitlab: z.string().optional(),
    url: z.string().optional(),
    project: z.object({
      github: z.string().optional(),
      gitlab: z.string().optional()
    }).optional()
  })
]).transform((item) => {
  const gh = item.github || item.project?.github;
  const gl = item.gitlab || item.project?.gitlab;
  if (gh) return { forge: 'github' as const, repo: gh.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '') };
  if (gl) return { forge: 'gitlab' as const, repo: gl.replace(/^https?:\/\/gitlab\.com\//i, '').replace(/\.git$/, '') };
  if (item.url) {
    const match = item.url.match(/github\.com\/([^/]+\/[^/]+)/i);
    if (match) return { forge: 'github' as const, repo: match[1].replace(/\.git$/, '') };
  }
  return undefined;
});

export const ResolutionsConfigSchema = z.union([
  z.record(
    z.enum(['npm', 'cargo', 'go', 'pypi']),
    z.record(z.string(), ManualResolutionItemSchema)
  ),
  z.null(),
  z.undefined()
]).transform(val => val ?? {});

export const OutputConfigSchema = z.object({
  comment_on_pull_request: z.boolean().default(true),
  create_summary: z.boolean().default(true),
  format: z.enum(['text', 'json', 'sarif']).default('text'),
  report_file: z.string().optional()
}).default({});

export const DripsConfigSchema = z.object({
  version: z.union([z.literal(1), z.literal('1')]).default(1),
  project: ProjectConfigSchema,
  dependencies: DependenciesConfigSchema,
  funding: FundingConfigSchema,
  policy: PolicyConfigSchema,
  exceptions: ExceptionsConfigSchema,
  resolutions: ResolutionsConfigSchema,
  output: OutputConfigSchema
});

export type DripsConfig = z.infer<typeof DripsConfigSchema>;
export type RawDripsConfig = z.input<typeof DripsConfigSchema>;
