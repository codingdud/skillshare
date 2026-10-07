import { readFile } from 'node:fs/promises';
import { pool, transaction } from './client.js';
import { backfillSyncIntegrity } from './sync-integrity.js';
import { retireLegacyProjects } from './retire-legacy.js';
try {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await transaction(async (db) => {
    await db.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const retired = await db.query("SELECT id FROM schema_migrations WHERE id='006-harness-only'");
    if (!retired.rowCount) await db.query(sql);
    for (const id of [
      '001-asset-modules',
      '002-project-export-plan',
      '003-project-composition',
      '004-harness-repositories',
      '005-harness-members',
      '006-harness-only',
      '007-cli-sync',
      '008-user-profiles',
      '009-admin-roles',
      '010-sync-integrity',
      '011-harness-collaboration',
      '012-harness-ratings',
    ]) {
      const applied = await db.query('SELECT id FROM schema_migrations WHERE id=$1', [id]);
      if (!applied.rowCount) {
        if (id === '006-harness-only') await retireLegacyProjects(db);
        await db.query(
          await readFile(new URL('./migrations/' + id + '.sql', import.meta.url), 'utf8'),
        );
        if (id === '010-sync-integrity') await backfillSyncIntegrity(db);
        await db.query('INSERT INTO schema_migrations(id) VALUES($1)', [id]);
      }
    }
  });
  console.log('Schema applied.');
} finally {
  await pool.end();
}
