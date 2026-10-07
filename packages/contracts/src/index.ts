import { z } from 'zod';
import { nativePackageSchema } from './native.js';
export * from './native.js';
export * from './asset-modules.js';
export * from './harnesses.js';
export * from './native-config.js';
export * from './harness-tree.js';
export * from './harness-sync.js';
export * from './profiles.js';
export * from './admin.js';
export * from './composition.js';
export * from './export-plan.js';
export * from './workflow.js';
import { workflowDefinitionSchema } from './workflow.js';
import { assetKinds, moduleDescriptorSchema, moduleReferenceSchema } from './asset-modules.js';

export const idSchema = z.uuid();
export const visibilitySchema = z.enum(['private', 'team', 'public']);
import { harnessFilesSchema } from './harness-files.js';
import { stableVersionSchema, checksumSchema } from './sync-protocol.js';
export * from './harness-files.js';
export * from './sync-protocol.js';
export const createHarnessSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3)
    .max(70),
  description: z.string().trim().min(10).max(600),
  visibility: visibilitySchema,
  files: harnessFilesSchema.default([]),
});
export const harnessChangesSchema = z.strictObject({
  revision: z.number().int().positive(),
  files: harnessFilesSchema,
});
export const harnessReleaseSchema = z.strictObject({
  revision: z.number().int().positive(),
  version: stableVersionSchema,
  notes: z.string().trim().min(5).max(2000),
  treeHash: checksumSchema.optional(),
});
export const harnessDiscoveryKinds = [
  'harness',
  'skill',
  'agent',
  'mcp',
  'hook',
  'settings',
] as const;
export const harnessDiscoveryQuerySchema = z.object({
  q: z.string().trim().max(300).default(''),
  type: z.enum(['all', ...harnessDiscoveryKinds]).default('all'),
  runtime: z.string().trim().max(80).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  sort: z.enum(['relevant', 'recent', 'rating']).default('relevant'),
});
export type HarnessDiscoveryQuery = z.infer<typeof harnessDiscoveryQuerySchema>;
export type HarnessDiscoveryItem = {
  id: string;
  type: (typeof harnessDiscoveryKinds)[number];
  name: string;
  summary: string;
  harnessId: string;
  harnessName: string;
  releaseId: string;
  version: string;
  ownerId: string;
  ownerName: string;
  visibility: 'private' | 'team' | 'public';
  path: string | null;
  runtimes: string[];
  updatedAt: string;
  fileCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  components: { type: string; name: string; path: string }[];
};
export type HarnessDiscoveryPage = Page<HarnessDiscoveryItem> & { runtimes: string[] };
export const assetTypeSchema = z.enum(assetKinds);
export const stages = [
  'Requirements',
  'Planning',
  'Design',
  'Development',
  'Testing',
  'Security',
  'Release',
  'Operations',
] as const;
export const stageSchema = z.enum(stages);
const shortText = z.string().trim().min(2).max(120);
export const loginSchema = z.strictObject({
  email: z.email().toLowerCase().max(254),
  password: z.string().min(1).max(128),
});
export const registerSchema = loginSchema.extend({
  name: shortText,
  password: z.string().min(12, 'Use at least 12 characters').max(128),
});
export const projectSchema = z.strictObject({
  name: shortText,
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3)
    .max(70),
  description: z.string().trim().min(10).max(600),
  visibility: visibilitySchema,
  readme: z.string().max(30000).default(''),
  composition: workflowDefinitionSchema.nullable().optional(),
});
export const projectCompositionSchema = z.strictObject({
  revision: z.number().int().positive(),
  composition: workflowDefinitionSchema.nullable(),
});
export const exampleSchema = z.strictObject({
  input: z.string().min(1).max(10000),
  output: z.string().min(1).max(20000),
  context: z.string().max(500).default('Creator-provided sample; not a live execution.'),
});
export const workflowStageSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
    .max(50),
  name: shortText,
  releaseId: idSchema,
  inputFrom: z.array(z.string().max(50)).max(20),
  output: z.string().min(2).max(500),
  approval: z.boolean(),
  failure: z.enum(['pause', 'stop', 'retry']),
  retries: z.number().int().min(0).max(5),
  timeoutSeconds: z.number().int().min(1).max(3600),
});
export const contentSchema = z.strictObject({
  name: shortText,
  summary: z.string().trim().min(10).max(600),
  instructions: z.string().max(100000),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(40)
        .regex(/^[a-z0-9-]+$/),
    )
    .max(8),
  stage: stageSchema,
  requirements: z.string().max(4000),
  output: z.string().max(4000),
  limitations: z.string().max(4000),
  license: z.enum(['MIT', 'CC-BY-4.0', 'All rights reserved']),
  examples: z.array(exampleSchema).max(10),
  dependencies: z.array(idSchema).max(30),
  stages: z.array(workflowStageSchema).max(30),
  nativePackage: nativePackageSchema.optional(),
  module: moduleDescriptorSchema.optional(),
  modules: z.array(moduleReferenceSchema).max(30).optional(),
  workflow: workflowDefinitionSchema.optional(),
  subagents: z.array(idSchema).max(30).optional(),
});
export const createAssetSchema = z.strictObject({
  projectId: idSchema,
  type: assetTypeSchema,
  content: contentSchema,
});
export const updateAssetSchema = z.strictObject({
  revision: z.number().int().positive(),
  content: contentSchema,
});
export const variantSchema = z.strictObject({
  projectId: idSchema,
  sourceReleaseId: idSchema,
  name: shortText,
  changes: z.string().trim().min(10).max(1000),
  tags: z
    .array(
      z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(40),
    )
    .max(8),
});
export const publishSchema = z.strictObject({
  revision: z.number().int().positive(),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Use a version such as 1.0.0')
    .max(30),
  notes: z.string().trim().min(5).max(2000),
});
export const reviewSchema = z.strictObject({
  releaseId: idSchema,
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(15).max(4000),
  task: z.string().trim().min(3).max(300),
});
export { harnessMemberSchema as memberSchema } from './collaboration.js';
export * from './collaboration.js';
export * from './ratings.js';
export const emailRequestSchema = z.strictObject({ email: z.email().toLowerCase().max(254) });
export const otpSchema = emailRequestSchema.extend({
  code: z.string().regex(/^\d{6}$/, 'Enter the six-digit code from your email.'),
});
export const resetPasswordSchema = z.strictObject({
  resetTicket: z.string().min(64).max(128),
  password: z.string().min(12, 'Use at least 12 characters.').max(128),
});
export const forkSchema = z.strictObject({
  sourceReleaseId: idSchema,
  name: shortText,
  slug: projectSchema.shape.slug,
});
export const proposalSchema = z.strictObject({
  baseReleaseId: idSchema,
  title: shortText,
  summary: z.string().trim().min(10).max(2000),
  content: contentSchema,
});
export const proposalDecisionSchema = z.strictObject({
  action: z.enum(['merge', 'close']),
  revision: z.number().int().positive(),
});
export const searchSchema = z.object({
  q: z.string().max(200).default(''),
  type: z.enum(['all', ...assetKinds]).default('all'),
  stage: z.string().max(40).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  sort: z.enum(['relevant', 'recent', 'rating']).default('relevant'),
  grouped: z.enum(['true', 'false']).default('true'),
});

export type Content = z.infer<typeof contentSchema>;
export type AssetType = z.infer<typeof assetTypeSchema>;
export type Visibility = z.infer<typeof visibilitySchema>;
export type User = { id: string; name: string; email: string; role: 'user' | 'admin' };
export type AuthResponse = { user: User; accessToken: string };
export type Project = {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  slug: string;
  description: string;
  visibility: Visibility;
  readme: string;
  createdAt: string;
  assetCount?: number;
  revision: number;
  sourceProjectId?: string | null;
  sourceProjectReleaseId?: string | null;
  composition?: z.infer<typeof workflowDefinitionSchema> | null;
};
export type Asset = {
  id: string;
  projectId: string;
  type: AssetType;
  ownerId: string;
  ownerName: string;
  projectName: string;
  visibility: Visibility;
  content: Content;
  revision: number;
  parentId: string | null;
  originalId: string | null;
  sourceReleaseId: string | null;
  sourceName: string | null;
  sourceVersion: string | null;
  sourceOwner: string | null;
  changes: string | null;
  latestReleaseId: string | null;
  version: string | null;
  updatedAt: string;
  rating: number | null;
  reviewCount: number;
  variantCount: number;
  saved: boolean;
};
export type Release = {
  id: string;
  assetId: string;
  version: string;
  content: Content;
  notes: string;
  createdAt: string;
};
export type Review = {
  id: string;
  userName: string;
  rating: number;
  body: string;
  task: string;
  version: string;
  updatedAt: string;
};
export type AssetDetail = {
  asset: Asset;
  releases: Release[];
  reviews: Review[];
  variants: Asset[];
  dependencies: {
    id: string;
    assetId: string;
    name: string;
    version: string;
    type: AssetType;
    ownerName?: string;
    content?: Content;
  }[];
};
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export const blankContent: Content = {
  name: '',
  summary: '',
  instructions: '',
  tags: [],
  stage: 'Requirements',
  requirements: '',
  output: '',
  limitations: '',
  license: 'MIT',
  examples: [],
  dependencies: [],
  stages: [],
};
