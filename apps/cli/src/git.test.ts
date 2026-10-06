import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { canonicalTree } from '@skillshare/contracts';
const remote = vi.hoisted(() => ({ manifest: null as any, calls: [] as any[] }));
const identity = vi.hoisted(() => ({ id: '833c21c5-e266-425c-9cdd-3c6d148a645a' }));
vi.mock('./config.js', async (original) => ({
  ...(await original<typeof import('./config.js')>()),
  binding: async () => ({
    schemaVersion: 1,
    server: 'http://localhost:4000',
    harnessId: identity.id,
    profiles: ['claude-code'],
  }),
}));
vi.mock('./auth.js', () => ({
  Client: class {
    async call(path: string, method = 'GET', body?: unknown) {
      remote.calls.push({ path, method, body });
      if (method === 'POST') return { id: 'proposal-id' };
      if (path.includes('/manifest')) return remote.manifest;
      return { capabilities: { canReadDraft: true } };
    }
  },
}));
import { git, readGitTree, importGit, exportGit } from './git.js';
let root: string;
const manifest = (files: any[]) => ({
  protocolVersion: 1,
  harnessId: identity.id,
  revision: 2,
  releaseId: randomUUID(),
  version: '1.0.0',
  canWrite: true,
  files,
  treeHash: createHash('sha256').update(canonicalTree(files)).digest('hex'),
});
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'skillsync-git-test-'));
  remote.calls = [];
  remote.manifest = manifest([{ path: 'AGENTS.md', content: 'Published instructions.\r\n' }]);
  await git(root, ['init']);
  await git(root, ['config', 'user.name', 'Test Developer']);
  await git(root, ['config', 'user.email', 'test@example.com']);
  await writeFile(join(root, 'AGENTS.md'), 'Committed instructions.\r\n');
  await writeFile(join(root, 'app.txt'), 'unrelated application file\n');
  await writeFile(join(root, '.gitattributes'), 'AGENTS.md -text\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-m', 'Initial application']);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
describe('Git bridge with actual repositories', () => {
  it('reads exact committed bytes and ignores dirty worktree content', async () => {
    await writeFile(join(root, 'AGENTS.md'), 'Uncommitted local edits.');
    const source = await readGitTree(root, 'HEAD', ['claude-code']);
    expect(source.files).toEqual([{ path: 'AGENTS.md', content: 'Committed instructions.\r\n' }]);
    expect(source.commit).toMatch(/^[a-f0-9]{40}$/);
    await expect(readGitTree(root, '--help', ['claude-code'])).rejects.toThrow();
  });
  it('rejects committed native symlinks without following them', async () => {
    const oid = (await git(root, ['hash-object', '-w', '--stdin'], Buffer.from('../secret')))
      .toString()
      .trim();
    await git(root, ['update-index', '--cacheinfo', '120000,' + oid + ',AGENTS.md']);
    await git(root, ['commit', '-m', 'Unsafe symlink']);
    await expect(readGitTree(root, 'HEAD', ['claude-code'])).rejects.toThrow(/symlink/);
  });
  it('creates a pinned proposal, preserves unselected profiles, and previews without POST', async () => {
    remote.manifest = manifest([
      { path: 'AGENTS.md', content: 'Base.' },
      { path: '.gemini/settings.json', content: '{}' },
    ]);
    await importGit(root, { dryRun: true });
    expect(remote.calls.every((c) => c.method === 'GET')).toBe(true);
    await importGit(root, { yes: true });
    const input = remote.calls.find((c) => c.method === 'POST').body;
    expect(input.revision).toBe(2);
    expect(input.source.commit).toBe((await git(root, ['rev-parse', 'HEAD'])).toString().trim());
    expect(input.files).toContainEqual({ path: '.gemini/settings.json', content: '{}' });
    expect(input.files).toContainEqual({
      path: 'AGENTS.md',
      content: 'Committed instructions.\r\n',
    });
  });
  it('requires explicit approval of imported deletions', async () => {
    remote.manifest = manifest([
      { path: 'AGENTS.md', content: 'Base.' },
      { path: '.claude/agents/old.md', content: 'Old agent' },
    ]);
    await expect(importGit(root, { yes: true })).rejects.toThrow(/allow-delete/);
    expect(remote.calls.some((c) => c.method === 'POST')).toBe(false);
    await importGit(root, { yes: true, allowDelete: true });
    expect(
      remote.calls.find((c) => c.method === 'POST').body.files.map((f: any) => f.path),
    ).not.toContain('.claude/agents/old.md');
  });
  it('exports exact bytes/modes to an isolated branch without hooks, filters, index or worktree changes', async () => {
    const original = (await git(root, ['rev-parse', 'HEAD'])).toString().trim();
    await writeFile(join(root, 'AGENTS.md'), 'Keep my uncommitted work.');
    const index = (await git(root, ['ls-files', '--stage'])).toString();
    await mkdir(join(root, 'hooks'));
    await writeFile(join(root, 'hooks', 'pre-commit'), '#!/bin/sh\nexit 99\n');
    await writeFile(
      join(root, 'hooks', 'post-index-change'),
      '#!/bin/sh\nprintf triggered > hook-executed.txt\n',
      { mode: 0o755 },
    );
    await git(root, ['config', 'core.hooksPath', join(root, 'hooks')]);
    remote.manifest = manifest([
      { path: 'AGENTS.md', content: 'Exact release bytes.\r\n', executable: true },
    ]);
    const objects = (await git(root, ['count-objects', '-v'])).toString();
    await exportGit(root, { branch: 'skillsync/release', dryRun: true });
    expect((await git(root, ['count-objects', '-v'])).toString()).toBe(objects);
    await exportGit(root, { branch: 'skillsync/release', yes: true });
    expect((await git(root, ['rev-parse', 'HEAD'])).toString().trim()).toBe(original);
    expect((await git(root, ['ls-files', '--stage'])).toString()).toBe(index);
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe('Keep my uncommitted work.');
    expect(await readFile(join(root, 'hook-executed.txt'), 'utf8').catch(() => null)).toBeNull();
    expect((await readGitTree(root, 'skillsync/release', ['claude-code'])).files).toEqual(
      remote.manifest.files,
    );
    expect((await git(root, ['show', 'skillsync/release:app.txt'])).toString()).toBe(
      'unrelated application file\n',
    );
    const base = JSON.parse(
      (await git(root, ['show', 'skillsync/release:.skillshare/base.json'])).toString(),
    );
    expect(base.files).toEqual(remote.manifest.files);
    expect(base.treeHash).toBe(remote.manifest.treeHash);
    expect(
      JSON.parse((await git(root, ['show', 'skillsync/release:.skillshare/lock.json'])).toString())
        .targetReleaseId,
    ).toBe(remote.manifest.releaseId);
    expect(
      (await git(root, ['log', '-1', '--format=%B', 'skillsync/release'])).toString(),
    ).toContain('Harness-Release: ' + remote.manifest.releaseId);
    const branch = (await git(root, ['rev-parse', 'skillsync/release'])).toString();
    await expect(exportGit(root, { branch: 'skillsync/release', yes: true })).rejects.toThrow();
    expect((await git(root, ['rev-parse', 'skillsync/release'])).toString()).toBe(branch);
  });
  it('refuses remote checksum mismatch and non Skillsync branch names', async () => {
    remote.manifest.treeHash = '0'.repeat(64);
    await expect(importGit(root, { yes: true })).rejects.toThrow(/mismatched/);
    await expect(exportGit(root, { branch: 'main', yes: true })).rejects.toThrow(/new branch/);
  });
  it('refuses a dangling symbolic export branch and symlinked native root', async () => {
    await git(root, ['symbolic-ref', 'refs/heads/skillsync/dangling', 'refs/heads/missing-target']);
    await expect(exportGit(root, { branch: 'skillsync/dangling', yes: true })).rejects.toThrow(
      /already exists/,
    );
    expect(
      (await git(root, ['symbolic-ref', 'refs/heads/skillsync/dangling'])).toString().trim(),
    ).toBe('refs/heads/missing-target');
    const oid = (await git(root, ['hash-object', '-w', '--stdin'], Buffer.from('../secret')))
      .toString()
      .trim();
    await git(root, ['update-index', '--add', '--cacheinfo', '120000,' + oid + ',.claude']);
    await git(root, ['commit', '-m', 'Unsafe native root']);
    await expect(readGitTree(root, 'HEAD', ['claude-code'])).rejects.toThrow(
      /root must be a directory/,
    );
  });
});
