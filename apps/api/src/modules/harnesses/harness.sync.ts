import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  harnessFilesSchema,
  harnessFileSchema,
  assertShareable,
  selectedSyncPath,
  canonicalTree,
  compareStableVersions,
  stableVersionSchema,
  changesetSchema,
  type SyncFile,
} from '@skillshare/contracts';
import { pool, transaction, type DB } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { harnessRepository as repo } from './harness.repository.js';
import { harnessService } from './harness.service.js';
import { authorize, directEdit } from './harness.policy.js';

export { changesetSchema };
export const treeHash = (files: SyncFile[]) =>
  createHash('sha256').update(canonicalTree(files)).digest('hex');
export async function recordRevision(
  db: DB,
  id: string,
  revision: number,
  files: SyncFile[],
  actor: string,
  source: string,
  message: string,
) {
  await db.query(
    'INSERT INTO harness_revisions(id,harness_id,revision,files,author_id,source,message,tree_hash,parent_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,(SELECT id FROM harness_revisions WHERE harness_id=$2 AND revision=$3-1))',
    [randomUUID(), id, revision, JSON.stringify(files), actor, source, message, treeHash(files)],
  );
}
async function draftAccess(id: string, userId?: string) {
  await authorize(id, userId, 'canReadDraft');
}
export const harnessSync = {
  async manifest(id: string, userId: string | undefined, ref: string) {
    const h = await harnessService.get(id, userId);
    if (ref === 'draft') {
      await draftAccess(id, userId);
      return {
        harnessId: id,
        name: h.name,
        revision: h.revision,
        ref,
        files: h.files,
        treeHash: treeHash(h.files),
        canWrite: h.capabilities.canEdit && !h.capabilities.requireReview,
        canPublish: h.capabilities.canPublish,
        protocolVersion: 1,
      };
    }
    const releases = await harnessService.releases(id, userId);
    const selected =
      ref === 'latest'
        ? releases
            .filter((r) => stableVersionSchema.safeParse(r.version).success)
            .sort((a, b) => compareStableVersions(b.version, a.version))[0]
        : releases.find((r) => r.id === ref || r.version === ref);
    if (!selected)
      throw new AppError(
        404,
        'RELEASE_NOT_FOUND',
        'No matching published release. Owners, editors and publishers can use --draft.',
      );
    const release = await harnessService.release(id, selected.id, userId);
    return {
      harnessId: id,
      name: h.name,
      revision: release.revision,
      ref: release.id,
      releaseId: release.id,
      version: release.version,
      files: release.files,
      treeHash: treeHash(release.files),
      canWrite: h.capabilities.canEdit && !h.capabilities.requireReview,
      canPublish: h.capabilities.canPublish,
      protocolVersion: 1,
    };
  },
  async push(id: string, userId: string, input: z.infer<typeof changesetSchema>) {
    await draftAccess(id, userId);
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    try {
      assertShareable(input.upsert);
    } catch (e) {
      throw new AppError(422, 'UNSAFE_SYNC', (e as Error).message);
    }
    for (const path of [...input.upsert.map((f) => f.path), ...input.remove])
      if (!selectedSyncPath(path, input.profiles))
        throw new AppError(
          422,
          'UNMANAGED_PATH',
          'Sync operation outside selected runtime files: ' + path,
        );
    return transaction(async (db) => {
      await authorize(id, userId, 'canReadDraft', db, true);
      const head = (await repo.lockDraft(id, userId, db)).rows[0];
      if (!head) throw new AppError(404, 'NOT_FOUND', 'Harness unavailable.');
      const previous = (
        await db.query(
          'SELECT request_hash,result FROM harness_changesets WHERE harness_id=$1 AND user_id=$2 AND request_id=$3',
          [id, userId, input.requestId],
        )
      ).rows[0];
      if (previous) {
        if (previous.request_hash !== requestHash)
          throw new AppError(
            409,
            'IDEMPOTENCY_CONFLICT',
            'Request ID was used with different changes.',
          );
        if (previous.result.files) return previous.result;
        const snapshot = (
          await db.query(
            'SELECT files,tree_hash FROM harness_revisions WHERE harness_id=$1 AND id=$2',
            [id, previous.result.revisionId],
          )
        ).rows[0];
        if (!snapshot || snapshot.tree_hash !== previous.result.treeHash)
          throw new AppError(
            409,
            'RECEIPT_UNAVAILABLE',
            'Acknowledged snapshot could not be verified.',
          );
        const { revisionId: _revisionId, ...receipt } = previous.result;
        return { ...receipt, files: snapshot.files };
      }
      // An acknowledged request is read-only on replay. Turning on review
      // protection must not strand a receipt after a lost response.
      directEdit(await authorize(id, userId, 'canEdit', db));
      if (head.revision !== input.revision)
        throw new AppError(
          409,
          'REVISION_CONFLICT',
          'Remote draft changed. Run status/pull --draft and review conflicts.',
        );
      const files = new Map<string, SyncFile>(
        harnessFilesSchema.parse(head.files).map((f) => [f.path, f]),
      );
      for (const path of input.remove) files.delete(path);
      for (const file of input.upsert) files.set(file.path, file);
      const next = harnessFilesSchema.parse([...files.values()]);
      let revision = head.revision as number;
      if (treeHash(next) !== treeHash(head.files)) {
        const update = await repo.updateDraft(id, userId, revision, next, db);
        revision = update.rows[0].revision;
        await recordRevision(db, id, revision, next, userId, 'cli', input.message);
      }
      const result = {
        harnessId: id,
        revision,
        ref: 'draft',
        files: next,
        treeHash: treeHash(next),
        canWrite: true,
        protocolVersion: 1,
      };
      const snapshotId = (
        await db.query('SELECT id FROM harness_revisions WHERE harness_id=$1 AND revision=$2', [
          id,
          revision,
        ])
      ).rows[0]?.id;
      const { files: _files, ...receipt } = result;
      await db.query(
        'INSERT INTO harness_changesets(harness_id,user_id,request_id,request_hash,result) VALUES($1,$2,$3,$4,$5)',
        [
          id,
          userId,
          input.requestId,
          requestHash,
          JSON.stringify({ ...receipt, revisionId: snapshotId }),
        ],
      );
      return result;
    });
  },
  async history(id: string, userId?: string, before?: number, limit = 50) {
    await draftAccess(id, userId);
    const items = (
      await pool.query(
        'SELECT r.id,r.revision,r.source,r.message,r.tree_hash AS "treeHash",r.parent_id AS "parentId",r.created_at AS "createdAt",u.name AS "authorName" FROM harness_revisions r LEFT JOIN users u ON u.id=r.author_id WHERE harness_id=$1 AND ($2::integer IS NULL OR r.revision < $2) ORDER BY revision DESC LIMIT $3',
        [id, before ?? null, limit + 1],
      )
    ).rows;
    const more = items.length > limit;
    return { items: items.slice(0, limit), nextCursor: more ? items[limit - 1].revision : null };
  },
  async revision(id: string, revisionId: string, userId?: string) {
    await draftAccess(id, userId);
    const row = (
      await pool.query(
        'SELECT id,revision,files,message,source,tree_hash AS "treeHash",parent_id AS "parentId" FROM harness_revisions WHERE harness_id=$1 AND id=$2',
        [id, revisionId],
      )
    ).rows[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Revision unavailable.');
    return row;
  },
};
