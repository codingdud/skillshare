import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import assert from 'node:assert/strict';
import { compareSync, type Binding, type SyncFile } from '../../packages/contracts/src/index.ts';
import { atomicJSON, settingsFile, saveState } from '../../apps/cli/src/lib/config.ts';
import { applyPull, treeHash } from '../../apps/cli/src/lib/files.ts';
const directory = await mkdtemp(resolve('.local/audits/flags-'));
process.env.SKILLSHARE_CONFIG_DIR = join(directory, 'account');
const file = (content: string): SyncFile => ({
  path: '.claude/agents/reviewer.md',
  content,
  executable: false,
});
let publications = 0,
  creations = 0;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'POST' && req.url === '/api/harnesses') creations++;
  if (req.url === '/api/oauth/token')
    return res.end(
      JSON.stringify({
        access_token: 'synthetic-audit-access',
        refresh_token: 'synthetic-audit-refresh',
      }),
    );
  if (req.method === 'POST' && req.url?.endsWith('/releases')) {
    publications++;
    return res.end(
      JSON.stringify({ id: '22222222-2222-4222-8222-222222222222', version: '1.0.0' }),
    );
  }
  if (req.url?.includes('/manifest?'))
    return res.end(
      JSON.stringify({
        protocolVersion: 1,
        harnessId: b.harnessId,
        ref: 'draft',
        revision: 1,
        files: [file('A')],
        treeHash: treeHash([file('A')]),
        canWrite: true,
      }),
    );
  res.statusCode = 404;
  res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Mock route unavailable' } }));
});
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const address = server.address() as { port: number };
const b: Binding = {
  schemaVersion: 1,
  harnessId: '11111111-1111-4111-8111-111111111111',
  server: `http://127.0.0.1:${address.port}`,
  profiles: ['claude-code'],
};
const root = join(directory, 'repo');
await mkdir(join(root, '.claude/agents'), { recursive: true });
await writeFile(join(root, file('').path), 'A');
await atomicJSON(join(root, '.skillshare/config.json'), b);
await saveState(root, b, 1, [file('A')]);
await atomicJSON(settingsFile(), {
  server: b.server,
  accounts: { [b.server]: { user: { id: 'synthetic-user' }, storage: 'file' } },
});
const key = createHash('sha256')
  .update(b.server + ':synthetic-user')
  .digest('hex');
await atomicJSON(join(directory, 'account/credentials', key + '.json'), {
  refreshToken: 'synthetic-audit-refresh',
});
const exec = promisify(execFile);
try {
  const published = await exec(
    process.execPath,
    [
      resolve('apps/cli/dist/bin.js'),
      'publish',
      '1.0.0',
      '--notes',
      'Synthetic audit release',
      '--yes',
      '--dry-run',
      '--root',
      root,
    ],
    { env: process.env, windowsHide: true },
  );
  assert.equal(publications, 0);
  await assert.rejects(() =>
    exec(
      process.execPath,
      [
        resolve('apps/cli/dist/bin.js'),
        'init',
        '--name',
        'Guarded init',
        '--description',
        'Do not create an orphan Harness.',
        '--profile',
        'claude-code',
        '--root',
        root,
      ],
      { env: process.env, windowsHide: true },
    ),
  );
  assert.equal(creations, 0);
  const repairBefore = await readFile(join(root, '.skillshare/local/state.json'), 'utf8');
  await exec(
    process.execPath,
    [resolve('apps/cli/dist/bin.js'), 'repair', '--from-local', '--dry-run', '--root', root],
    { env: process.env, windowsHide: true },
  );
  assert.equal(await readFile(join(root, '.skillshare/local/state.json'), 'utf8'), repairBefore);
  await applyPull(root, b, compareSync([file('A')], [file('A')], [file('B')], 'pull').changes, [
    file('A'),
  ]);
  const recovered = await exec(
    process.execPath,
    [resolve('apps/cli/dist/bin.js'), 'recover', '--dry-run', '--root', root],
    { env: process.env, windowsHide: true },
  );
  assert.equal(await readFile(join(root, file('').path), 'utf8'), 'B');
  for (const args of [
    ['setup', '--dry-run'],
    ['recover', '--version', '1.0.0'],
    ['pull', '--draft', '--version', '1.0.0'],
  ]) {
    await assert.rejects(() =>
      exec(process.execPath, [resolve('apps/cli/dist/bin.js'), ...args, '--root', root], {
        env: process.env,
        windowsHide: true,
      }),
    );
  }
  const result = {
    id: 'B7',
    publicationRequestsDuringDryRun: publications,
    nativeRollbackDuringDryRun: false,
    publishOutput: published.stdout.trim(),
    recoverOutput: recovered.stdout.trim(),
    invalidFlagCombinationsRejected: true,
    duplicateInitCreatesNoRemoteHarness: creations === 0,
    isolatedMockServer: true,
    fixtureDirectory: directory,
  };
  await writeFile(resolve('.local/audits/cli-flags-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await new Promise<void>((done) => server.close(() => done()));
  delete process.env.SKILLSHARE_CONFIG_DIR;
}
