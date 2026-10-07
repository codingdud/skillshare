import { pool, type DB } from '../../db/client.js';
import { harnessFilesSchema } from '@skillshare/contracts';
import type { z } from 'zod';

type Files = z.infer<typeof harnessFilesSchema>;
const releaseOrder = `CASE WHEN version ~ '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$' THEN split_part(version,'.',1)::numeric END DESC NULLS LAST, CASE WHEN version ~ '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$' THEN split_part(version,'.',2)::numeric END DESC NULLS LAST, CASE WHEN version ~ '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$' THEN split_part(version,'.',3)::numeric END DESC NULLS LAST, created_at DESC,id`;
const fields =
  'h.id,h.owner_id AS "ownerId",u.name AS "ownerName",h.name,h.slug,h.description,h.visibility,h.revision,h.created_at AS "createdAt",CASE WHEN h.owner_id=$1 OR EXISTS(SELECT 1 FROM harness_members m WHERE m.harness_id=h.id AND m.user_id=$1 AND m.role IN (\'editor\',\'publisher\')) THEN h.draft_files ELSE COALESCE((SELECT r.files FROM harness_releases r WHERE r.harness_id=h.id ORDER BY ' +
  releaseOrder +
  " LIMIT 1),'[]'::jsonb) END AS files";
export const harnessRepository = {
  async discoverySnapshots(userId?: string, savedOnly = false) {
    return (
      await pool.query(
        'SELECT h.id,h.name,h.description,h.visibility,h.owner_id AS "ownerId",u.name AS "ownerName",r.id AS "releaseId",r.version,r.files,r.created_at AS "updatedAt",(SELECT round(avg(rating),2)::float8 FROM harness_ratings WHERE harness_id=h.id) AS "ratingAverage",(SELECT count(*)::int FROM harness_ratings WHERE harness_id=h.id) AS "ratingCount" FROM harnesses h JOIN users u ON u.id=h.owner_id JOIN LATERAL (SELECT id,version,files,created_at FROM harness_releases WHERE harness_id=h.id ORDER BY ' +
          releaseOrder +
          ' LIMIT 1) r ON true WHERE (h.visibility=$1 OR h.owner_id=$2 OR EXISTS(SELECT 1 FROM harness_members hm WHERE hm.harness_id=h.id AND hm.user_id=$2)) AND (NOT $3::boolean OR EXISTS(SELECT 1 FROM harness_saves s WHERE s.harness_id=h.id AND s.user_id=$2))',
        ['public', userId ?? null, savedOnly],
      )
    ).rows;
  },
  async saveBookmark(id: string, userId: string, saved: boolean) {
    return saved
      ? pool.query(
          'INSERT INTO harness_saves(user_id,harness_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [userId, id],
        )
      : pool.query('DELETE FROM harness_saves WHERE user_id=$1 AND harness_id=$2', [userId, id]);
  },
  async isSaved(id: string, userId: string) {
    return (
      ((
        await pool.query('SELECT 1 FROM harness_saves WHERE user_id=$1 AND harness_id=$2', [
          userId,
          id,
        ])
      ).rowCount ?? 0) > 0
    );
  },
  async activity(userId: string) {
    return (
      await pool.query(
        'SELECT r.id,r.harness_id AS "harnessId",h.name AS "harnessName",r.version,r.notes,r.created_at AS "createdAt" FROM harness_releases r JOIN harnesses h ON h.id=r.harness_id WHERE h.owner_id=$1 OR EXISTS(SELECT 1 FROM harness_members hm WHERE hm.harness_id=h.id AND hm.user_id=$1) ORDER BY r.created_at DESC,r.id LIMIT 100',
        [userId],
      )
    ).rows;
  },
  async list(userId?: string, workspaceOnly = false) {
    return (
      await pool.query(
        'SELECT ' +
          fields +
          ', (SELECT count(*)::int FROM harness_releases r WHERE r.harness_id=h.id) AS "releaseCount" FROM harnesses h JOIN users u ON u.id=h.owner_id WHERE (h.visibility=\'public\' AND NOT $2::boolean) OR h.owner_id=$1 OR EXISTS(SELECT 1 FROM harness_members hm WHERE hm.harness_id=h.id AND hm.user_id=$1) ORDER BY h.created_at DESC LIMIT 100',
        [userId ?? null, workspaceOnly],
      )
    ).rows;
  },
  async get(id: string, userId?: string, db: DB = pool) {
    return (
      await db.query(
        'SELECT ' +
          fields +
          " FROM harnesses h JOIN users u ON u.id=h.owner_id WHERE h.id=$2 AND (h.visibility='public' OR h.owner_id=$1 OR EXISTS(SELECT 1 FROM harness_members hm WHERE hm.harness_id=h.id AND hm.user_id=$1))",
        [userId ?? null, id],
      )
    ).rows[0];
  },
  async insert(
    input: {
      id: string;
      ownerId: string;
      name: string;
      slug: string;
      description: string;
      visibility: string;
      files: Files;
    },
    db: DB = pool,
  ) {
    await db.query(
      'INSERT INTO harnesses(id,owner_id,name,slug,description,visibility,draft_files) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        input.id,
        input.ownerId,
        input.name,
        input.slug,
        input.description,
        input.visibility,
        JSON.stringify(input.files),
      ],
    );
  },
  async updateDraft(id: string, userId: string, revision: number, files: Files, db: DB) {
    return db.query(
      "UPDATE harnesses h SET draft_files=$1,revision=revision+1 WHERE h.id=$2 AND (h.owner_id=$3 OR EXISTS(SELECT 1 FROM harness_members m WHERE m.harness_id=h.id AND m.user_id=$3 AND m.role IN ('editor','publisher'))) AND h.revision=$4 RETURNING h.revision",
      [JSON.stringify(files), id, userId, revision],
    );
  },
  async lockDraft(id: string, userId: string, db: DB) {
    return db.query(
      "SELECT h.revision,h.draft_files AS files FROM harnesses h WHERE h.id=$1 AND (h.owner_id=$2 OR EXISTS(SELECT 1 FROM harness_members m WHERE m.harness_id=h.id AND m.user_id=$2 AND m.role IN ('editor','publisher'))) FOR UPDATE",
      [id, userId],
    );
  },
  async insertRelease(
    input: {
      id: string;
      harnessId: string;
      version: string;
      revision: number;
      files: Files;
      notes: string;
      treeHash: string;
    },
    db: DB,
  ) {
    await db.query(
      'INSERT INTO harness_releases(id,harness_id,version,revision,files,notes,tree_hash,revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT id FROM harness_revisions WHERE harness_id=$2 AND revision=$4))',
      [
        input.id,
        input.harnessId,
        input.version,
        input.revision,
        JSON.stringify(input.files),
        input.notes,
        input.treeHash,
      ],
    );
  },
  async release(harnessId: string, releaseId: string) {
    return (
      await pool.query(
        'SELECT id,version,revision,files,notes,created_at AS "createdAt" FROM harness_releases WHERE id=$1 AND harness_id=$2',
        [releaseId, harnessId],
      )
    ).rows[0];
  },
  async releases(harnessId: string) {
    return (
      await pool.query(
        'SELECT id,version,revision,notes,created_at AS "createdAt" FROM harness_releases WHERE harness_id=$1 ORDER BY ' +
          releaseOrder,
        [harnessId],
      )
    ).rows;
  },
};
