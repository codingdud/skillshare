import { mkdir, mkdtemp, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import {
  compareSync,
  harnessFilesSchema,
  harnessReleaseSchema,
  harnessJSONLimit,
  inspectHarnessTree,
  assertShareable,
  type Binding,
  type SyncFile,
} from '../../packages/contracts/src/index.ts';
import {
  atomicJSON,
  saveState,
  state,
  stateFile,
  stateUpdates,
  settingsFile,
} from '../../apps/cli/src/config.ts';
import { applyPull, recover, scan, treeHash } from '../../apps/cli/src/files.ts';
import { Client } from '../../apps/cli/src/auth.ts';
import { synchronize, add } from '../../apps/cli/src/sync.ts';

const directory = await mkdtemp(resolve('.local/audits/fixtures-'));
process.env.SKILLSHARE_CONFIG_DIR = join(directory, 'account');
const b: Binding = {
  schemaVersion: 1,
  harnessId: '11111111-1111-4111-8111-111111111111',
  server: 'http://localhost:4000',
  profiles: ['claude-code'],
};
await atomicJSON(settingsFile(), {
  accounts: { [b.server]: { user: { id: 'audit-user' }, storage: 'file' } },
});
const file = (content: string): SyncFile => ({
  path: '.claude/agents/reviewer.md',
  content,
  executable: false,
});
async function fixture(label: string, content = 'A') {
  const root = join(directory, label);
  await mkdir(join(root, '.claude/agents'), { recursive: true });
  await writeFile(join(root, file('').path), content);
  await atomicJSON(join(root, '.skillshare/config.json'), b);
  return root;
}
function snapshot(files: SyncFile[], revision = 2) {
  return {
    protocolVersion: 1,
    harnessId: b.harnessId,
    revision,
    ref: 'draft',
    files,
    canWrite: true,
    treeHash: treeHash(files),
  };
}
let remote = snapshot([file('B')]);
let response = remote;
let posts = 0;
const originalCall = Client.prototype.call;
Client.prototype.call = async function (_path, method = 'GET') {
  if (method === 'POST') {
    posts++;
    return structuredClone(response);
  }
  return structuredClone(remote);
};
const results: Record<string, unknown>[] = [];
try {
  const clone = await fixture('fresh-clone');
  await saveState(clone, b, 1, [file('A')]);
  await unlink(stateFile(clone));
  let missingBaseline = '';
  try {
    await synchronize(clone, 'status', {});
  } catch (error) {
    missingBaseline = (error as NodeJS.ErrnoException).code ?? (error as Error).message;
  }
  assert.equal(missingBaseline, '');
  let blockedAdd = '';
  try {
    await add(clone, b, { linkOnly: true });
  } catch (error) {
    blockedAdd = (error as Error).message;
  }
  assert.match(blockedAdd, /already has a Harness binding/);
  results.push({
    id: 'B1',
    observed: 'Fresh clone uses tracked baseline; add still protects the existing binding',
    verified: true,
  });

  const retry = await fixture('pending-retry', 'C');
  await saveState(retry, b, 1, [file('A')]);
  await atomicJSON(join(retry, '.skillshare/local/push-request.json'), {
    revision: 1,
    requestId: '33333333-3333-4333-8333-333333333333',
    profiles: b.profiles,
    message: 'Previously submitted B',
    upsert: [file('B')],
    remove: [],
  });
  await synchronize(retry, 'push', {});
  const retryBase = await state(retry, b);
  const retryConflict = compareSync(retryBase.files, [file('C')], remote.files, 'push');
  assert.equal(retryBase.files[0].content, 'B');
  assert.equal(retryConflict.conflicts.length, 0);
  results.push({
    id: 'B2',
    observed: 'Replay advances baseline to acknowledged B; later local C remains a valid new edit',
    verified: true,
  });

  const interrupted = await fixture('metadata-rollback');
  await saveState(interrupted, b, 1, [file('A')]);
  await applyPull(
    interrupted,
    b,
    compareSync([file('A')], [file('A')], [file('B')], 'pull').changes,
    [file('A')],
  );
  // Simulates a process ending after synchronize.saveState and before journal deletion.
  const journalPath = join(interrupted, '.skillshare/local/pull-journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  const updates = stateUpdates(b, 2, [file('B')]);
  for (const entry of journal.metadata)
    if (entry.path in updates) entry.after = JSON.stringify(updates[entry.path], null, 2) + '\n';
  await atomicJSON(journalPath, journal);
  await saveState(interrupted, b, 2, [file('B')]);
  await recover(interrupted, b);
  const after = await readFile(join(interrupted, file('').path), 'utf8');
  const recoveredBase = await state(interrupted, b);
  assert.equal(after, 'A');
  assert.equal(recoveredBase.files[0].content, 'A');
  results.push({
    id: 'B3',
    observed: 'Recovery restores original files and baseline together',
    verified: true,
  });

  const divergent = await fixture('mixed-release');
  await saveState(divergent, b, 1, [file('A')]);
  remote = {
    ...snapshot([
      file('A'),
      { path: '.claude/agents/second.md', content: 'Remote new', executable: false },
    ]),
    releaseId: '22222222-2222-4222-8222-222222222222',
    version: '1.0.0',
  } as typeof remote;
  await writeFile(join(divergent, file('').path), 'Local variant');
  await synchronize(divergent, 'pull', { yes: true });
  const lock = JSON.parse(await readFile(join(divergent, '.skillshare/lock.json'), 'utf8'));
  const localHash = treeHash(await scan(divergent, b));
  assert.notEqual(localHash, lock.remoteTreeHash);
  assert.equal(lock.diverged, true);
  assert.equal(lock.installedTreeHash, localHash);
  assert.equal(lock.targetReleaseId, '22222222-2222-4222-8222-222222222222');
  results.push({
    id: 'G1',
    observed:
      'Successful pull retains local variant but lock identifies remote release; lock explicitly distinguishes target from installed contents',
    verified: true,
  });

  const collision = [{ path: '.claude/agents', content: 'File at a directory path' }, file('A')];
  assert.equal(harnessFilesSchema.safeParse(collision).success, false);
  results.push({
    id: 'B4',
    observed: 'Snapshot schema rejects ancestor-file collisions',
    verified: true,
  });

  assert.equal(
    harnessReleaseSchema.safeParse({ revision: 1, version: '01.02.03', notes: 'Audit release' })
      .success,
    false,
  );
  results.push({
    id: 'B5',
    observed: 'Version validator rejects leading-zero versions',
    verified: true,
  });

  const textOnly = compareSync(
    [file('one\ntwo\n')],
    [file('one\r\ntwo\r\n')],
    [file('ONE\ntwo\n')],
    'pull',
  );
  assert.equal(textOnly.conflicts.length, 1);
  assert.equal(
    compareSync([file('one\ntwo\n')], [file('one\r\ntwo\r\n')], [file('ONE\ntwo\n')], 'pull', true)
      .conflicts.length,
    0,
  );
  results.push({
    id: 'G2',
    observed:
      'Raw line endings are preserved by default; explicit CRLF equivalence avoids conversion-only conflicts',
    verified: true,
  });

  const recovery = await fixture('recovery-retry');
  await applyPull(recovery, b, compareSync([file('A')], [file('A')], [file('B')], 'pull').changes, [
    file('A'),
  ]);
  // Simulate recovery's first file write finishing, but process ending before journal deletion.
  await writeFile(join(recovery, file('').path), 'A');
  let retryError = '';
  try {
    await recover(recovery, b);
  } catch (error) {
    retryError = (error as Error).message;
  }
  assert.equal(retryError, '');
  assert.equal(await readFile(join(recovery, file('').path), 'utf8'), 'A');
  results.push({
    id: 'B6',
    observed: 'Interrupted recovery accepts already-restored files and finishes',
    verified: true,
  });

  const literal = [
    {
      path: '.mcp.json',
      content: JSON.stringify({
        mcpServers: {
          example: {
            command: 'node',
            args: ['example.js'],
            env: { API_KEY: 'synthetic-audit-value' },
          },
        },
      }),
    },
  ];
  assert.equal(harnessFilesSchema.safeParse(literal).success, true);
  assert.equal(
    inspectHarnessTree(literal).issues.filter((issue) => issue.severity === 'error').length,
    0,
  );
  assert.throws(() => assertShareable(literal), /Possible literal credential/);
  results.push({
    id: 'B8',
    observed:
      'Private draft schema allows editing; common shareability rejects literal credentials at publication (HTTP regression tested in integration.test.ts)',
    verified: true,
  });

  const large = Array.from({ length: 20 }, (_, index) => ({
    path: `.claude/agents/${index}.md`,
    content: '\n'.repeat(250000),
  }));
  assert.equal(harnessFilesSchema.safeParse(large).success, true);
  const wireBytes = Buffer.byteLength(JSON.stringify({ revision: 1, files: large }));
  assert.ok(wireBytes > 6 * 1024 * 1024);
  assert.ok(wireBytes < harnessJSONLimit);
  results.push({
    id: 'G3',
    observed: 'Accepted escaped 5 MB snapshot fits the aligned 36 MB JSON transport limit',
    wireBytes,
    verified: true,
  });
} finally {
  Client.prototype.call = originalCall;
  delete process.env.SKILLSHARE_CONFIG_DIR;
}
await writeFile(
  resolve('.local/audits/sync-audit-results.json'),
  JSON.stringify(
    { fixtureDirectory: directory, tests: results, remoteRequestsMocked: true, posts },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    { verifiedScenarios: results.length, results, remoteRequestsMocked: true },
    null,
    2,
  ),
);
