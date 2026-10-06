import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const path = new URL('../apps/api/.env', import.meta.url);
try {
  await readFile(path);
  console.log('Existing API .env kept.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await mkdir(new URL('../.local', import.meta.url), { recursive: true });
  await writeFile(
    path,
    `NODE_ENV=development\nPORT=4000\nDATABASE_URL=pglite://../.local/database\nJWT_SECRET=${randomBytes(48).toString('base64url')}\nWEB_ORIGIN=http://localhost:5173\nSMTP_HOST=localhost\nSMTP_PORT=11025\nSMTP_SECURE=false\nSMTP_USER=\nSMTP_PASS=\nMAIL_FROM=SkillShare <noreply@skillshare.test>\n`,
  );
  console.log('Created local development configuration with a generated secret.');
}
