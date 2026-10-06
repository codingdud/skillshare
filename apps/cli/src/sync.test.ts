import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, lstat, symlink, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  compareSync,
  selectedSyncPath,
  assertShareable,
  type Binding,
  type SyncFile,
} from '@skillshare/contracts';
import {
  scan,
  applyPull,
  recover,
  journalFile,
  treeHash,
  safePath,
  withWorkspaceLock,
  finishPull,
} from './files.js';
import {
  atomicJSON,
  saveState,
  state,
  stateUpdates,
  baseFile,
  stateFile,
  settingsFile,
} from './config.js';
const remote = vi.hoisted(() => ({
  value: null as any,
  requests: [] as any[],
  receipts: new Map<string, any>(),
  loseResponse: false,
}));
const fault = vi.hoisted(() => ({ target: '', committed: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      await actual.rename(from, to);
      if (fault.target === to) {
        fault.target = '';
        throw new Error('Injected process interruption');
      }
      if (
        fault.committed &&
        to.endsWith('pull-journal.json') &&
        JSON.parse(await actual.readFile(to, 'utf8')).phase === 'committed'
      ) {
        fault.committed = false;
        throw new Error('Injected committed interruption');
      }
    },
  };
});
vi.mock('./auth.js', () => ({
  ApiError: class extends Error {},
  Client: class {
    async call(path: string, method = 'GET', body?: any) {
      remote.requests.push({ path, method, body });
      if (method === 'POST') {
        if (remote.receipts.has(body.requestId))
          return structuredClone(remote.receipts.get(body.requestId));
        const files = new Map<string, SyncFile>(
          remote.value.files.map((f: SyncFile) => [f.path, f]),
        );
        for (const p of body.remove) files.delete(p);
        for (const f of body.upsert) files.set(f.path, f);
        remote.value = {
          ...remote.value,
          revision: remote.value.revision + 1,
          files: [...files.values()],
        };
        remote.value.treeHash = treeHash(remote.value.files);
        remote.receipts.set(body.requestId, structuredClone(remote.value));
        if (remote.loseResponse) {
          remote.loseResponse = false;
          throw new Error('Response lost');
        }
      }
      return structuredClone(remote.value);
    }
  },
}));
import { synchronize, resolveConflict, repair } from './sync.js';
let root: string, accountDir: string;
const b: Binding = {
  schemaVersion: 1,
  harnessId: '11111111-1111-4111-8111-111111111111',
  server: 'http://localhost:4000',
  profiles: ['claude-code'],
};
const file = (content: string): SyncFile => ({
  path: '.claude/agents/reviewer.md',
  content,
  executable: false,
});
async function put(f: SyncFile) {
  await mkdir(join(root, '.claude/agents'), { recursive: true });
  await writeFile(join(root, f.path), f.content);
}
function setRemote(files: SyncFile[], revision = 2) {
  remote.value = {
    harnessId: b.harnessId,
    revision,
    files,
    treeHash: treeHash(files),
    protocolVersion: 1,
    canWrite: true,
    releaseId: '22222222-2222-4222-8222-222222222222',
    version: '1.0.0',
  };
}
beforeEach(async () => {
  root = await mkdtemp(resolve('.local/cli-test-'));
  accountDir = await mkdtemp(resolve('.local/cli-account-'));
  process.env.SKILLSHARE_CONFIG_DIR = accountDir;
  await atomicJSON(settingsFile(), {
    accounts: { [b.server]: { user: { id: 'user' }, storage: 'file' } },
  });
  await atomicJSON(join(root, '.skillshare/config.json'), b);
  remote.requests = [];
  remote.receipts.clear();
  remote.loseResponse = false;
  fault.target = '';
  fault.committed = false;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.SKILLSHARE_CONFIG_DIR;
  if (
    !root.startsWith(resolve('.local') + '\\') ||
    !accountDir.startsWith(resolve('.local') + '\\')
  ) {
    if (process.platform === 'win32') throw new Error('Unsafe cleanup path');
  }
  await rm(root, { recursive: true, force: true });
  await rm(accountDir, { recursive: true, force: true });
});
describe('three-way native file sync', () => {
  it('lets an explicit local conflict decision become a reviewed push', async () => {
    await put(file('local'));
    await saveState(root, b, 1, [file('base')]);
    setRemote([file('remote')]);
    await expect(resolveConflict(root, file('').path, 'local', { draft: true })).rejects.toThrow(
      '--yes',
    );
    await resolveConflict(root, file('').path, 'local', { draft: true, yes: true });
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('local');
    await synchronize(root, 'push', {});
    expect(remote.value.files[0].content).toBe('local');
  });
  it('requires deletion approval when resolving to a remote deletion', async () => {
    await put(file('local'));
    await saveState(root, b, 1, [file('base')]);
    setRemote([]);
    await expect(
      resolveConflict(root, file('').path, 'remote', { draft: true, yes: true }),
    ).rejects.toThrow('--allow-delete');
    await resolveConflict(root, file('').path, 'remote', {
      draft: true,
      yes: true,
      allowDelete: true,
    });
    expect(await lstat(join(root, file('').path)).catch(() => null)).toBeNull();
  });
  it('serializes local mutations and releases the lock after failures', async () => {
    await withWorkspaceLock(root, async () => {
      await expect(withWorkspaceLock(root, async () => undefined)).rejects.toThrow(
        'Another CLI operation',
      );
    });
    await expect(
      withWorkspaceLock(root, async () => {
        throw new Error('failed operation');
      }),
    ).rejects.toThrow('failed operation');
    await expect(withWorkspaceLock(root, async () => 42)).resolves.toBe(42);
  });
  it('preserves executable flags when installing native hook scripts', async () => {
    await saveState(root, b, 1, []);
    const script = {
      path: '.claude/hooks/review.sh',
      content: '#!/bin/sh\necho review\n',
      executable: true,
    };
    setRemote([script]);
    await synchronize(root, 'pull', { yes: true, draft: true });
    expect((await scan(root, b)).find((f) => f.path === script.path)).toEqual(script);
  });
  it('detects same-path edit/delete conflicts while accepting identical changes', () => {
    expect(
      compareSync([file('base')], [file('local')], [file('remote')], 'pull').conflicts,
    ).toEqual([file('').path]);
    expect(compareSync([file('base')], [file('local')], [], 'pull').conflicts).toEqual([
      file('').path,
    ]);
    expect(compareSync([file('base')], [file('same')], [file('same')], 'push')).toEqual({
      changes: [],
      conflicts: [],
    });
  });
  it('pulls a remote change and preserves unselected files and local-only edits', async () => {
    await put(file('base'));
    const own = { path: '.claude/agents/local.md', content: 'local only', executable: false };
    await put(own);
    await mkdir(join(root, '.github/workflows'), { recursive: true });
    await writeFile(join(root, '.github/workflows/build.yml'), 'unrelated');
    await saveState(root, b, 1, [file('base')]);
    setRemote([file('remote'), { path: 'README.md', content: 'remote unselected' }]);
    await synchronize(root, 'pull', { yes: true, draft: true });
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('remote');
    expect(await readFile(join(root, own.path), 'utf8')).toBe('local only');
    expect(await readFile(join(root, '.github/workflows/build.yml'), 'utf8')).toBe('unrelated');
    expect(await lstat(join(root, 'README.md')).catch(() => null)).toBeNull();
    expect(await lstat(journalFile(root)).catch(() => null)).toBeNull();
  });
  it('dry-run makes no native or baseline writes and conflicts preserve edits', async () => {
    await put(file('local'));
    await saveState(root, b, 1, [file('base')]);
    setRemote([file('remote')]);
    const previous = await readFile(stateFile(root), 'utf8');
    await synchronize(root, 'pull', { dryRun: true, draft: true });
    await expect(synchronize(root, 'pull', { yes: true, draft: true })).rejects.toThrow(
      'Conflicting',
    );
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('local');
    expect(await readFile(stateFile(root), 'utf8')).toBe(previous);
  });
  it('requires explicit managed deletions', async () => {
    await put(file('base'));
    await saveState(root, b, 1, [file('base')]);
    setRemote([]);
    await expect(synchronize(root, 'pull', { yes: true, draft: true })).rejects.toThrow(
      '--allow-delete',
    );
    await synchronize(root, 'pull', { yes: true, draft: true, allowDelete: true });
    expect(await lstat(join(root, file('').path)).catch(() => null)).toBeNull();
  });
  it('keeps remote-only edits pending after pushing another file', async () => {
    await put(file('base'));
    const own = { path: '.claude/agents/local.md', content: 'local new', executable: false };
    await put(own);
    await saveState(root, b, 1, [file('base')]);
    setRemote([file('remote')]);
    await synchronize(root, 'push', { message: 'Add local agent' });
    expect(remote.value.files.find((f: SyncFile) => f.path === file('').path).content).toBe(
      'remote',
    );
    await synchronize(root, 'pull', { yes: true, draft: true });
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('remote');
    expect(await readFile(join(root, own.path), 'utf8')).toBe('local new');
  });
  it('follows the installed release unless another ref is explicitly selected', async () => {
    await put(file('base'));
    await saveState(root, b, 1, [file('base')]);
    setRemote([file('base')]);
    await atomicJSON(join(root, '.skillshare/lock.json'), {
      schemaVersion: 1,
      harnessId: b.harnessId,
      server: b.server,
      releaseId: remote.value.releaseId,
      version: '1.0.0',
      revision: 2,
      treeHash: remote.value.treeHash,
      files: [{ path: file('').path, hash: treeHash([file('base')]) }],
    });
    await synchronize(root, 'pull', { dryRun: true });
    expect(remote.requests[0].path).toContain('ref=' + remote.value.releaseId);
  });
  it('can roll back completed writes from an interrupted pull', async () => {
    await put(file('base'));
    const changes = compareSync([file('base')], [file('base')], [file('remote')], 'pull').changes;
    await applyPull(root, b, changes, [file('base')]);
    await recover(root, b);
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('base');
  });
  it('refuses to overwrite edits made after an interrupted pull', async () => {
    await put(file('base'));
    await applyPull(
      root,
      b,
      compareSync([file('base')], [file('base')], [file('remote')], 'pull').changes,
      [file('base')],
    );
    await put(file('edited after crash'));
    await expect(recover(root, b)).rejects.toThrow('Recovery blocked');
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('edited after crash');
  });
  it('excludes private state and unrelated GitHub files; rejects secrets and traversal', async () => {
    expect(selectedSyncPath('.claude/settings.local.json', b.profiles)).toBe(false);
    expect(selectedSyncPath('.gemini/oauth_creds.json', ['gemini-cli'])).toBe(false);
    expect(selectedSyncPath('.github/workflows/build.yml', ['copilot-cli'])).toBe(false);
    expect(() =>
      assertShareable([{ path: '.mcp.json', content: '{"apiKey":"secret-literal-value"}' }]),
    ).toThrow('Possible literal');
    await expect(safePath(root, '../outside.md')).rejects.toThrow('outside');
  });
});

describe('sync audit regressions', () => {
  it('boots a fresh clone from the tracked base and preserves changes after a branch switch', async () => {
    await put(file('local'));
    await saveState(root, b, 1, [file('old branch')]);
    await unlink(stateFile(root));
    setRemote([file('old branch')]);
    await synchronize(root, 'status', {});
    expect((await state(root, b)).files[0]?.content).toBe('old branch');
    const other = stateUpdates(b, 5, [file('other branch')]);
    await atomicJSON(baseFile(root), other['.skillshare/base.json']);
    expect((await state(root, b)).revision).toBe(5);
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('local');
  });
  it('advances a replayed acknowledgement before pushing subsequent local edits', async () => {
    await saveState(root, b, 1, [file('A')]);
    await put(file('B'));
    setRemote([file('A')], 1);
    remote.loseResponse = true;
    await expect(synchronize(root, 'push', {})).rejects.toThrow('Response lost');
    await put(file('C'));
    await synchronize(root, 'push', {});
    expect((await state(root, b)).files[0]?.content).toBe('B');
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('C');
    await synchronize(root, 'push', {});
    expect(remote.value.files[0].content).toBe('C');
  });
  for (const metadataPath of [
    '.skillshare/base.json',
    '.skillshare/local/state.json',
    '.skillshare/lock.json',
  ]) {
    it('rolls back both files and metadata after interruption at ' + metadataPath, async () => {
      await put(file('A'));
      await saveState(root, b, 1, [file('A')]);
      const initial = await readFile(baseFile(root), 'utf8');
      setRemote([file('B')]);
      fault.target = join(root, metadataPath);
      await expect(synchronize(root, 'pull', { draft: true, yes: true })).rejects.toThrow(
        'Injected',
      );
      await recover(root, b);
      expect(await readFile(join(root, file('').path), 'utf8')).toBe('A');
      expect(await readFile(baseFile(root), 'utf8')).toBe(initial);
      expect((await state(root, b)).revision).toBe(1);
      expect(await lstat(journalFile(root)).catch(() => null)).toBeNull();
    });
  }
  it('finalizes an already committed pull without restoring old content', async () => {
    await put(file('A'));
    await saveState(root, b, 1, [file('A')]);
    setRemote([file('B')]);
    fault.committed = true;
    await expect(synchronize(root, 'pull', { draft: true, yes: true })).rejects.toThrow(
      'Injected committed',
    );
    await recover(root, b);
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('B');
    expect((await state(root, b)).files[0]?.content).toBe('B');
  });
  it('recovers after native replacement but before completion was journalled', async () => {
    await put(file('A'));
    await saveState(root, b, 1, [file('A')]);
    setRemote([file('B')]);
    fault.target = join(root, file('').path);
    await expect(synchronize(root, 'pull', { yes: true, draft: true })).rejects.toThrow('Injected');
    await recover(root, b);
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('A');
  });
  it('resumes recovery after restoring a file and after restoring metadata', async () => {
    await put(file('A'));
    await saveState(root, b, 1, [file('A')]);
    await applyPull(root, b, compareSync([file('A')], [file('A')], [file('B')], 'pull').changes, [
      file('A'),
    ]);
    fault.target = join(root, file('').path);
    await expect(recover(root, b)).rejects.toThrow('Injected');
    // Metadata restoration is idempotent when its original bytes are already present.
    fault.target = '';
    await recover(root, b);
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('A');
    expect((await state(root, b)).revision).toBe(1);
  });
  it('keeps recover dry-run read-only and refuses divergent metadata', async () => {
    await put(file('A'));
    await saveState(root, b, 1, [file('A')]);
    await applyPull(root, b, compareSync([file('A')], [file('A')], [file('B')], 'pull').changes, [
      file('A'),
    ]);
    const original = await readFile(journalFile(root), 'utf8');
    await recover(root, b, true);
    expect(await readFile(journalFile(root), 'utf8')).toBe(original);
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('B');
    await atomicJSON(
      baseFile(root),
      stateUpdates(b, 9, [file('external')])['.skillshare/base.json'],
    );
    await expect(recover(root, b)).rejects.toThrow('metadata changed');
  });
  it('distinguishes remote release and installed tree when a local variant is retained', async () => {
    await put(file('local variant'));
    await saveState(root, b, 1, [file('base')]);
    setRemote([file('base')]);
    await synchronize(root, 'pull', { yes: true });
    const lock = JSON.parse(await readFile(join(root, '.skillshare/lock.json'), 'utf8'));
    expect(lock.diverged).toBe(true);
    expect(lock.targetReleaseId).toBe(remote.value.releaseId);
    expect(lock.installedTreeHash).toBe(treeHash(await scan(root, b)));
    expect(lock.installedTreeHash).not.toBe(lock.selectedTreeHash);
  });
  it('uses cached status offline without sending requests and treats CRLF only by explicit choice', async () => {
    await put(file('a\r\nb\r\n'));
    await saveState(root, b, 1, [file('a\nb\n')]);
    setRemote([file('A\nb\n')]);
    await synchronize(root, 'status', {});
    remote.requests = [];
    await synchronize(root, 'diff', { offline: true });
    expect(remote.requests).toHaveLength(0);
    await synchronize(root, 'pull', { draft: true, yes: true, ignoreCRLF: true });
    expect(await readFile(join(root, file('').path), 'utf8')).toBe('A\nb\n');
  });
});

it('retains executable intent when ignored Windows mode state is missing from a clone', async () => {
  await put(file('hook'));
  const hook = { ...file('hook'), executable: true };
  await saveState(root, b, 1, [hook]);
  if (process.platform === 'win32') {
    expect((await scan(root, b))[0]?.executable).toBe(true);
    setRemote([{ ...hook, content: 'new hook' }]);
    await synchronize(root, 'pull', { draft: true, yes: true });
    expect((await scan(root, b))[0]?.executable).toBe(true);
  }
});

it('resumes rollback across a partial metadata restoration', async () => {
  await put(file('A'));
  await saveState(root, b, 1, [file('A')]);
  setRemote([file('B')]);
  fault.target = stateFile(root);
  await expect(synchronize(root, 'pull', { draft: true, yes: true })).rejects.toThrow('Injected');
  fault.target = baseFile(root);
  await expect(recover(root, b)).rejects.toThrow('Injected');
  await recover(root, b);
  expect((await state(root, b)).files[0]?.content).toBe('A');
  expect(JSON.parse(await readFile(stateFile(root), 'utf8')).files[0].content).toBe('A');
});
it('resumes rollback when restored bytes precede executable-mode restoration', async () => {
  if (process.platform !== 'win32') return;
  await put(file('A'));
  await saveState(root, b, 1, [file('A')]);
  setRemote([{ ...file('B'), executable: true }]);
  await applyPull(
    root,
    b,
    compareSync([file('A')], [file('A')], remote.value.files, 'pull').changes,
    [file('A')],
  );
  fault.target = join(root, file('').path);
  await expect(recover(root, b)).rejects.toThrow('Injected');
  await recover(root, b);
  expect((await scan(root, b))[0]).toEqual(file('A'));
});

it('requires explicit baseline repair after recovery from an older journal without metadata backups', async () => {
  await put(file('B'));
  await saveState(root, b, 2, [file('B')]);
  await atomicJSON(journalFile(root), {
    changes: [{ path: file('').path, before: file('A'), after: file('B') }],
    before: [file('A')],
    completed: [file('').path],
  });
  await recover(root, b);
  expect(await readFile(join(root, file('').path), 'utf8')).toBe('A');
  await expect(state(root, b)).rejects.toThrow('older recovery journal');
});

it('lets owners explicitly repair an unpinned legacy baseline without modifying native files', async () => {
  await put(file('local choice'));
  setRemote([file('remote')]);
  await atomicJSON(stateFile(root), { needsRepair: true });
  await repair(root, undefined, { fromLocal: true, dryRun: true });
  await expect(state(root, b)).rejects.toThrow('older recovery');
  await repair(root, undefined, { fromLocal: true, yes: true });
  expect((await state(root, b)).files).toEqual([file('local choice')]);
  expect(await readFile(join(root, file('').path), 'utf8')).toBe('local choice');
  expect(remote.requests.every((r) => r.method === 'GET')).toBe(true);
});
