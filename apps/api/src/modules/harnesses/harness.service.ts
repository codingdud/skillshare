import { randomUUID } from 'node:crypto';
import { strToU8, zipSync, type Zippable } from 'fflate';
import type { z } from 'zod';
import {
  createHarnessSchema,
  harnessChangesSchema,
  harnessFilesSchema,
  harnessReleaseSchema,
  inspectHarnessTree,
  assertShareable,
  type HarnessDiscoveryQuery,
} from '@skillshare/contracts';
import { transaction } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { harnessRepository as repo } from './harness.repository.js';
import { discoverSnapshots } from './harness.discovery.js';
import { recordRevision, treeHash } from './harness.sync.js';
import { authorize, capabilities, directEdit } from './harness.policy.js';
import { ratingService } from './harness.ratings.js';
type HarnessInput = z.infer<typeof createHarnessSchema>;
type Changes = z.infer<typeof harnessChangesSchema>;
type ReleaseInput = z.infer<typeof harnessReleaseSchema>;
export const harnessService = {
  async discover(query: HarnessDiscoveryQuery, userId?: string, savedOnly = false) {
    return discoverSnapshots(await repo.discoverySnapshots(userId, savedOnly), query);
  },
  async bookmark(id: string, userId: string, saved: boolean) {
    await this.get(id, userId);
    await repo.saveBookmark(id, userId, saved);
  },
  async saved(id: string, userId: string) {
    await this.get(id, userId);
    return repo.isSaved(id, userId);
  },
  activity(userId: string) {
    return repo.activity(userId);
  },
  list(userId?: string, workspaceOnly = false) {
    return repo.list(userId, workspaceOnly);
  },
  async create(input: HarnessInput, userId: string) {
    const id = randomUUID();
    await transaction(async (db) => {
      await repo.insert(
        {
          id,
          ownerId: userId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          visibility: input.visibility,
          files: input.files,
        },
        db,
      );
      await recordRevision(db, id, 1, input.files, userId, 'web', 'Create Harness');
    });
    return this.get(id, userId);
  },
  async get(id: string, userId?: string) {
    const harness = await repo.get(id, userId);
    if (!harness)
      throw new AppError(404, 'NOT_FOUND', 'Harness unavailable or access is restricted.');
    const { average, count } = await ratingService.summary(id);
    return {
      ...harness,
      capabilities: await capabilities(id, userId),
      rating: { average, count },
    };
  },
  async save(
    id: string,
    userId: string,
    input: Changes,
    source = 'web',
    message = 'Save native files',
  ) {
    await transaction(async (db) => {
      directEdit(await authorize(id, userId, 'canEdit', db, true));
      const current = await repo.lockDraft(id, userId, db);
      if (
        current.rows[0]?.revision === input.revision &&
        treeHash(current.rows[0].files) === treeHash(input.files)
      )
        return;
      const result = await repo.updateDraft(id, userId, input.revision, input.files, db);
      if (!result.rowCount) {
        throw new AppError(
          409,
          'REVISION_CONFLICT',
          'This Harness changed elsewhere. Your local file edits are retained; reload or compare before saving again.',
        );
      }
      await recordRevision(db, id, result.rows[0].revision, input.files, userId, source, message);
    });
    return this.get(id, userId);
  },
  async publish(id: string, userId: string, input: ReleaseInput) {
    return transaction(async (db) => {
      await authorize(id, userId, 'canPublish', db, true);
      const current = await repo.lockDraft(id, userId, db);
      if (!current.rows.length) throw new AppError(404, 'NOT_FOUND', 'Harness not found.');
      if (current.rows[0].revision !== input.revision)
        throw new AppError(
          409,
          'REVISION_CONFLICT',
          'The saved Harness changed. Review the latest files before publishing.',
        );
      const files = harnessFilesSchema.parse(current.rows[0].files);
      if (!files.length)
        throw new AppError(422, 'EMPTY_HARNESS', 'Add at least one native file before publishing.');
      try {
        assertShareable(files);
      } catch (error) {
        throw new AppError(422, 'UNSAFE_RELEASE', (error as Error).message);
      }
      if (input.treeHash && input.treeHash !== treeHash(files))
        throw new AppError(
          409,
          'CHECKSUM_CONFLICT',
          'The reviewed release checksum differs from the saved draft.',
        );
      const errors = inspectHarnessTree(files).issues.filter((issue) => issue.severity === 'error');
      if (errors.length)
        throw new AppError(
          422,
          'INVALID_CONFIGURATION',
          'Fix native configuration before publishing: ' +
            errors[0]!.path +
            ': ' +
            errors[0]!.message,
        );
      const release = {
        id: randomUUID(),
        harnessId: id,
        version: input.version,
        revision: input.revision,
        files,
        notes: input.notes,
        treeHash: treeHash(files),
      };
      await repo.insertRelease(release, db);
      return {
        id: release.id,
        version: release.version,
        revision: release.revision,
        files,
        notes: release.notes,
      };
    });
  },
  async release(id: string, releaseId: string, userId?: string) {
    await this.get(id, userId);
    const release = await repo.release(id, releaseId);
    if (!release) throw new AppError(404, 'NOT_FOUND', 'Harness release not found.');
    return release;
  },
  async exportRelease(id: string, releaseId: string, userId?: string) {
    const release = await this.release(id, releaseId, userId);
    const entries: Zippable = Object.create(null);
    for (const file of harnessFilesSchema.parse(release.files))
      entries[file.path] = [
        strToU8(file.content),
        { os: 3, attrs: (file.executable ? 0o100755 : 0o100644) << 16 },
      ];
    return {
      version: release.version,
      archive: zipSync(entries, { level: 6, mtime: new Date('2000-01-01T00:00:00Z') }),
    };
  },
  async releases(id: string, userId?: string) {
    await this.get(id, userId);
    return repo.releases(id);
  },
};
