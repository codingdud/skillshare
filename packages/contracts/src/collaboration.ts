import { z } from 'zod';
import { harnessFilesSchema } from './harness-files.js';

export const harnessRoleSchema = z.enum(['viewer', 'editor', 'publisher']);
export const harnessMemberSchema = z.strictObject({
  email: z.email().toLowerCase(),
  role: harnessRoleSchema.default('viewer'),
});
export const gitSourceSchema = z.strictObject({
  kind: z.literal('git'),
  commit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
});
export const harnessProposalSchema = z.strictObject({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().max(4000).default(''),
  revision: z.number().int().positive(),
  files: harnessFilesSchema,
  source: gitSourceSchema.optional(),
});
export const harnessProposalDecisionSchema = z.strictObject({
  treeHash: z.string().regex(/^[a-f0-9]{64}$/),
  comment: z.string().trim().max(4000).default(''),
});
export const harnessProposalMergeSchema = harnessProposalDecisionSchema.extend({
  revision: z.number().int().positive(),
});
export type HarnessCapabilities = {
  role: 'owner' | z.infer<typeof harnessRoleSchema> | null;
  canReadDraft: boolean;
  canEdit: boolean;
  canPublish: boolean;
  canManage: boolean;
  canPropose: boolean;
  canReview: boolean;
  requireReview: boolean;
};
