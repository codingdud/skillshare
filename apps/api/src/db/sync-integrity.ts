import { createHash } from 'node:crypto';
import { canonicalTree, type SyncFile } from '@skillshare/contracts';
import type { DB } from './client.js';

export async function backfillSyncIntegrity(db: DB) {
  for (const table of ['harness_revisions', 'harness_releases'] as const) {
    const rows = (await db.query(`SELECT id,files FROM ${table} WHERE tree_hash IS NULL`)).rows;
    for (const row of rows) {
      const hash = createHash('sha256')
        .update(canonicalTree(row.files as SyncFile[]))
        .digest('hex');
      await db.query(`UPDATE ${table} SET tree_hash=$1 WHERE id=$2`, [hash, row.id]);
    }
  }
  // Compact successful receipts only where the exact acknowledged snapshot is retained.
  await db.query(`UPDATE harness_changesets c SET result=(c.result - 'files') || jsonb_build_object('revisionId',v.id)
    FROM harness_revisions v WHERE v.harness_id=c.harness_id AND v.revision=(c.result->>'revision')::integer AND v.files=c.result->'files'`);
}
