import { app } from './app.js';
import { config } from './config.js';
import { pool } from './db/client.js';
import { setTimeout as delay } from 'node:timers/promises';
async function waitForDatabase() {
  const deadline = Date.now() + 30000;
  let announced = false;
  while (true) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch {
      if (Date.now() >= deadline) {
        throw new Error(
          'Database unavailable. Start Docker Desktop and run docker compose up -d --wait. Check DATABASE_URL in apps/api/.env.',
        );
      }
      if (!announced) {
        console.log('Waiting for the database before starting the API…');
        announced = true;
      }
      await delay(500);
    }
  }
  const schema = await pool.query(
    "SELECT to_regclass('public.users') AS users, to_regclass('public.harnesses') AS harnesses, to_regclass('public.harness_saves') AS saves, to_regclass('public.harness_revisions') AS revisions, to_regclass('public.admin_audit_events') AS audit, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='role') AS roles, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='profile_revision') AS profiles, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='harness_releases' AND column_name='revision_id') AS sync_integrity",
  );
  if (
    !schema.rows[0]?.users ||
    !schema.rows[0]?.harnesses ||
    !schema.rows[0]?.saves ||
    !schema.rows[0]?.revisions ||
    !schema.rows[0]?.profiles ||
    !schema.rows[0]?.roles ||
    !schema.rows[0]?.audit ||
    !schema.rows[0]?.sync_integrity
  )
    throw new Error(
      'Database schema is missing. Run npm run db:migrate and npm run db:seed before starting the API.',
    );
  const collaboration = await pool.query(
    "SELECT to_regclass('public.harness_proposals') AS proposals",
  );
  if (!collaboration.rows[0]?.proposals)
    throw new Error('Run npm run db:migrate before starting the API (migration 011 is required).');
}
try {
  await waitForDatabase();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Database startup failed.');
  await pool.end();
  process.exit(1);
}
const server = app.listen(config.PORT, () =>
  console.log(`SkillShare API listening on http://localhost:${config.PORT}`),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
