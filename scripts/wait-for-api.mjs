import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const env = await readFile(new URL('../apps/api/.env', import.meta.url), 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
const port = process.env.PORT ?? env.match(/^PORT=(\d+)\s*$/m)?.[1] ?? '4000';
const deadline = Date.now() + 45000;
console.log('Waiting for the SkillShare API and database…');
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    // The API may still be starting or waiting for PostgreSQL.
  }
  await delay(500);
}
if (!ready) {
  console.error(
    'API is not ready. Start Docker Desktop, run docker compose up -d --wait, and check the API startup output. Use npm run db:migrate if database setup is missing.',
  );
  process.exitCode = 1;
}
