import { readFile, writeFile } from 'node:fs/promises';
const root = JSON.parse(await readFile('package.json', 'utf8'));
root.scripts.setup = 'node scripts/setup.mjs && npm run db:migrate && npm run db:seed';
await writeFile('package.json', JSON.stringify(root, null, 2) + '\n');
const api = JSON.parse(await readFile('apps/api/package.json', 'utf8'));
api.scripts.build = 'tsc --noEmit && tsup';
api.dependencies['@electric-sql/pglite'] = 'latest';
await writeFile('apps/api/package.json', JSON.stringify(api, null, 2) + '\n');
