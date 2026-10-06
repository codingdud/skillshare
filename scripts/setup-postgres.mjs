import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const rootEnv = new URL('../.env', import.meta.url),
  apiEnv = new URL('../apps/api/.env', import.meta.url);
let root = '';
try {
  root = await readFile(rootEnv, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let password = root.match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1];
if (!password) {
  password = randomBytes(24).toString('hex');
  await writeFile(rootEnv, `${root}\nPOSTGRES_PASSWORD=${password}\n`);
}
let api = '';
try {
  api = await readFile(apiEnv, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const url = `DATABASE_URL=postgresql://skillshare:${encodeURIComponent(password)}@localhost:55432/skillshare`;
if (api) api = api.replace(/^DATABASE_URL=.*$/m, url);
else
  api = `NODE_ENV=development\nPORT=4000\n${url}\nJWT_SECRET=${randomBytes(48).toString('base64url')}\nWEB_ORIGIN=http://localhost:5173\n`;
await writeFile(apiEnv, api);
console.log('Configured local PostgreSQL with generated development credentials.');
