import { z } from 'zod';
import { bindingSchema, type SyncFile } from './harness-sync.js';
import { harnessFilesSchema, harnessFileSchema } from './harness-files.js';

// v1 bytes are retained so existing release checksums remain valid.
export const treeHashFormat = 'sha256-tree-v1' as const;
export function canonicalTree(files: SyncFile[]) {
  return JSON.stringify(
    [...files]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((f) => [f.path, f.content, !!f.executable]),
  );
}
export const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const stableVersionSchema = z
  .string()
  .max(100)
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    'Use a stable X.Y.Z version without leading zeros.',
  );
export function compareStableVersions(a: string, b: string) {
  const x = a.split('.').map(BigInt),
    y = b.split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]! ? 1 : -1;
  return 0;
}
export const manifestSchema = z.object({
  protocolVersion: z.literal(1),
  harnessId: z.uuid(),
  revision: z.number().int().positive(),
  files: harnessFilesSchema,
  treeHash: checksumSchema,
  canWrite: z.boolean(),
  canPublish: z.boolean().optional(),
  releaseId: z.uuid().optional(),
  version: z.string().max(100).optional(),
});
export const syncStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  harnessId: z.uuid(),
  server: z.url(),
  revision: z.number().int().positive(),
  files: harnessFilesSchema,
});
export const baselineSchema = syncStateSchema.extend({
  hashFormat: z.literal(treeHashFormat),
  treeHash: checksumSchema,
  profiles: bindingSchema.shape.profiles,
});
export const changesetSchema = z
  .strictObject({
    revision: z.number().int().positive(),
    requestId: z.uuid(),
    message: z.string().trim().min(2).max(2000),
    profiles: bindingSchema.shape.profiles,
    upsert: harnessFilesSchema,
    remove: z.array(harnessFileSchema.shape.path).max(1000),
  })
  .superRefine((input, ctx) => {
    if (
      new Set(input.remove).size !== input.remove.length ||
      input.remove.some((p) => input.upsert.some((f) => f.path.toLowerCase() === p.toLowerCase()))
    )
      ctx.addIssue({ code: 'custom', message: 'Each path may be changed only once per request.' });
  });
export const releaseLockSchema = z.strictObject({
  schemaVersion: z.literal(2),
  harnessId: z.uuid(),
  server: z.url(),
  profiles: bindingSchema.shape.profiles,
  revision: z.number().int().positive(),
  targetReleaseId: z.uuid().optional(),
  version: z.string().max(100).optional(),
  remoteTreeHash: checksumSchema,
  selectedTreeHash: checksumSchema,
  baselineTreeHash: checksumSchema,
  installedTreeHash: checksumSchema,
  installedModes: z.record(harnessFileSchema.shape.path, z.boolean()).optional(),
  diverged: z.boolean(),
  hashFormat: z.literal(treeHashFormat),
});
export const journalMetadataPaths = [
  '.skillshare/config.json',
  '.skillshare/base.json',
  '.skillshare/lock.json',
  '.skillshare/local/state.json',
  '.skillshare/local/modes.json',
] as const;
export const pullJournalSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    requiresRepair: z.boolean().optional(),
    operationId: z.uuid(),
    binding: bindingSchema,
    phase: z.enum(['prepared', 'applying', 'committed', 'rolling-back']),
    changes: z
      .array(
        z.strictObject({
          path: harnessFileSchema.shape.path,
          before: harnessFileSchema.optional(),
          after: harnessFileSchema.optional(),
        }),
      )
      .max(1000),
    initialModes: z.record(harnessFileSchema.shape.path, z.boolean()).default({}),
    before: harnessFilesSchema,
    completed: z.array(harnessFileSchema.shape.path).max(1000),
    inProgress: harnessFileSchema.shape.path.optional(),
    rollbackInProgress: harnessFileSchema.shape.path.optional(),
    rolledBack: z.array(harnessFileSchema.shape.path).max(1000).default([]),
    metadata: z
      .array(
        z.strictObject({
          path: z.enum(journalMetadataPaths),
          before: z.string().nullable(),
          after: z.string().nullable().optional(),
        }),
      )
      .max(5),
  })
  .superRefine((journal, ctx) => {
    const paths = journal.changes.map((c) => c.path);
    if (
      new Set(paths).size !== paths.length ||
      journal.changes.some(
        (c) => (c.before && c.before.path !== c.path) || (c.after && c.after.path !== c.path),
      ) ||
      [
        ...journal.completed,
        ...journal.rolledBack,
        ...(journal.inProgress ? [journal.inProgress] : []),
        ...(journal.rollbackInProgress ? [journal.rollbackInProgress] : []),
      ].some((p) => !paths.includes(p)) ||
      new Set(journal.metadata.map((m) => m.path)).size !== journal.metadata.length
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid journal path relationships.' });
  });

export const pendingPushSchema = z.strictObject({
  schemaVersion: z.literal(2),
  binding: bindingSchema,
  request: changesetSchema,
});
export const cachedManifestSchema = z.strictObject({
  binding: bindingSchema,
  fetchedAt: z.iso.datetime(),
  manifest: manifestSchema,
});
export const historyQuerySchema = z.strictObject({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function nextStablePatch(version: string) {
  if (!stableVersionSchema.safeParse(version).success) return '1.0.0';
  const [major, minor, patch] = version.split('.');
  return major + '.' + minor + '.' + (BigInt(patch!) + 1n).toString();
}

export const legacyReleaseLockSchema = z.strictObject({
  schemaVersion: z.literal(1),
  harnessId: z.uuid(),
  server: z.url(),
  releaseId: z.uuid(),
  version: z.string().max(100),
  revision: z.number().int().positive(),
  treeHash: checksumSchema,
  files: z
    .array(z.strictObject({ path: harnessFileSchema.shape.path, hash: checksumSchema }))
    .max(1000),
});
