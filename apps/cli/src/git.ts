import { spawn } from 'node:child_process';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  harnessFilesSchema,
  harnessProposalSchema,
  manifestSchema,
  releaseLockSchema,
  treeHashFormat,
  canonicalTree,
  assertShareable,
  selectedSyncPath,
  type Binding,
  type SyncFile,
} from '@skillshare/contracts';
import { binding, stateUpdates } from './config.js';
import { Client } from './auth.js';
import { safePath } from './files.js';

class GitFailure extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
  ) {
    super(message);
  }
}
const disabledHooks = join(tmpdir(), 'skillsync-disabled-hooks-' + randomUUID());

// Read raw objects; do not checkout, run filters/hooks, follow replace refs, or
// lazily fetch missing objects from a repository-supplied remote.
export function git(
  root: string,
  args: string[],
  input?: Buffer,
  extraEnv: Record<string, string> = {},
) {
  return new Promise<Buffer>((resolve, reject) => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    );
    const child = spawn(
      'git',
      [
        '--no-replace-objects',
        '-c',
        'core.hooksPath=' + disabledHooks,
        '-c',
        'core.fsmonitor=false',
        '-C',
        root,
        ...args,
      ],
      {
        env: {
          ...env,
          GIT_NO_LAZY_FETCH: '1',
          GIT_ALLOW_PROTOCOL: '',
          GIT_TERMINAL_PROMPT: '0',
          ...extraEnv,
        },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const output: Buffer[] = [];
    let size = 0,
      failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error('Git operation timed out.');
      child.kill();
    }, 30000);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 8_000_000) {
        failure = new Error('Git output exceeded the inspection limit.');
        child.kill();
      } else output.push(chunk);
    });
    child.stderr.resume(); // Never echo repository-supplied errors/URLs with credentials.
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error('Git could not start: ' + error.message));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0)
        reject(
          new GitFailure(
            'Git ' + args[0] + ' failed. Check the local repository, revision, and Git identity.',
            code,
          ),
        );
      else resolve(Buffer.concat(output));
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}
async function commit(root: string, ref: string) {
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).toString('utf8').trim();
  const [actual, requested] = await Promise.all([realpath(top), realpath(root)]);
  const same =
    process.platform === 'win32'
      ? actual.toLowerCase() === requested.toLowerCase()
      : actual === requested;
  if (!same)
    throw new Error(
      'Run the Git bridge from the Git worktree root. Native paths are relative to that root.',
    );
  if (!ref || ref.length > 200 || ref.includes('\0'))
    throw new Error('Choose a valid local Git revision.');
  const id = (await git(root, ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}']))
    .toString('ascii')
    .trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id)) throw new Error('Invalid Git commit object.');
  return id;
}
type Entry = { path: string; mode: string; oid: string; size: number };
function checkedManifest(data: unknown, b: Binding) {
  const result = manifestSchema.parse(data);
  if (
    result.harnessId !== b.harnessId ||
    createHash('sha256').update(canonicalTree(result.files)).digest('hex') !== result.treeHash
  )
    throw new Error('Git bridge received a mismatched Harness snapshot.');
  return result;
}
async function entries(root: string, id: string, profiles: Binding['profiles']) {
  const bytes = await git(root, ['ls-tree', '-r', '-z', '-l', id]);
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const items: Entry[] = [];
  for (const raw of bytes.toString('binary').split('\0')) {
    if (!raw) continue;
    const tab = raw.indexOf('\t'),
      metadata = raw.slice(0, tab).trim().split(/\s+/);
    const path = decoder.decode(Buffer.from(raw.slice(tab + 1), 'binary'));
    const nativeRoot =
      (path === '.claude' && profiles.includes('claude-code')) ||
      (path === '.gemini' && profiles.includes('gemini-cli')) ||
      (path === '.github' && profiles.some((p) => p.startsWith('copilot-'))) ||
      (path === '.vscode' && profiles.includes('copilot-vscode'));
    if (nativeRoot)
      throw new Error(
        'Native runtime root must be a directory, not a symlink/submodule/file: ' + path,
      );
    if (!selectedSyncPath(path, profiles)) continue;
    const [mode, type, oid, size] = metadata;
    if (type !== 'blob' || !['100644', '100755'].includes(mode!))
      throw new Error('Unsupported symlink/submodule in native tree: ' + path);
    if (!oid || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid))
      throw new Error('Invalid Git blob identity.');
    if (!Number.isSafeInteger(Number(size)) || Number(size) > 250000)
      throw new Error('Native Git file is too large: ' + path);
    items.push({ path, mode: mode!, oid, size: Number(size) });
  }
  if (items.length > 1000 || items.reduce((n, e) => n + e.size, 0) > 5_000_000)
    throw new Error('Native Git tree exceeds Harness limits.');
  return items;
}
export async function readGitTree(root: string, ref: string, profiles: Binding['profiles']) {
  const id = await commit(root, ref),
    tree = await entries(root, id, profiles),
    files: SyncFile[] = [];
  for (const entry of tree) {
    const bytes = await git(root, ['cat-file', 'blob', entry.oid]);
    files.push({
      path: entry.path,
      content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
      ...(entry.mode === '100755' ? { executable: true } : {}),
    });
  }
  const checked = harnessFilesSchema.parse(files);
  assertShareable(checked);
  return { commit: id, files: checked };
}
export async function importGit(
  root: string,
  options: {
    ref?: string;
    message?: string;
    notes?: string;
    dryRun?: boolean;
    yes?: boolean;
    allowDelete?: boolean;
  },
) {
  await safePath(root, '.skillshare/config.json');
  const b = await binding(root),
    client = new Client(b.server);
  const h = await client.call('/api/harnesses/' + b.harnessId);
  const base = checkedManifest(
    await client.call(
      '/api/harnesses/' +
        b.harnessId +
        '/manifest?ref=' +
        (h.capabilities.canReadDraft ? 'draft' : 'latest'),
    ),
    b,
  );
  const source = await readGitTree(root, options.ref ?? 'HEAD', b.profiles);
  if (!source.files.length)
    throw new Error('The selected Git commit contains no native files for your profiles.');
  const removed = base.files.filter(
    (f) => selectedSyncPath(f.path, b.profiles) && !source.files.some((s) => s.path === f.path),
  );
  if (removed.length && !options.allowDelete)
    throw new Error(
      'Git import removes ' + removed.length + ' native files. Review and use --allow-delete.',
    );
  const files = harnessFilesSchema.parse([
    ...base.files.filter((f) => !selectedSyncPath(f.path, b.profiles)),
    ...source.files,
  ]);
  const input = harnessProposalSchema.parse({
    title: options.message ?? 'Import Git commit ' + source.commit.slice(0, 12),
    description: options.notes ?? '',
    revision: base.revision,
    files,
    source: { kind: 'git', commit: source.commit },
  });
  console.log(
    'Git commit ' + source.commit + ' → proposal based on Harness revision ' + base.revision,
  );
  for (const file of source.files) console.log('  ' + file.path);
  for (const file of removed) console.log('  remove ' + file.path);
  if (options.dryRun) return;
  if (!options.yes) throw new Error('Review with --dry-run, then use --yes to submit a proposal.');
  const proposal = await client.call('/api/harnesses/' + b.harnessId + '/proposals', 'POST', input);
  const site = b.server === 'http://localhost:4000' ? 'http://localhost:5173' : b.server;
  console.log(
    'Proposal ' +
      proposal.id +
      ' created. Review at ' +
      site +
      '/harnesses/' +
      b.harnessId +
      '/changes?proposal=' +
      proposal.id,
  );
}
export async function exportGit(
  root: string,
  options: {
    ref?: string;
    branch?: string;
    version?: string;
    dryRun?: boolean;
    yes?: boolean;
    allowDelete?: boolean;
  },
) {
  await safePath(root, '.skillshare/config.json');
  if (!options.branch?.startsWith('skillsync/'))
    throw new Error('Choose a new branch with --branch skillsync/NAME.');
  await git(root, ['check-ref-format', '--branch', options.branch]);
  const base = await commit(root, options.ref ?? 'HEAD');
  const reference = 'refs/heads/' + options.branch;
  for (const args of [
    ['symbolic-ref', '-q', reference],
    ['show-ref', '--verify', '--quiet', reference],
  ]) {
    let exists = false;
    try {
      await git(root, args);
      exists = true;
    } catch (error) {
      if (!(error instanceof GitFailure) || error.exitCode !== 1) throw error;
    }
    if (exists) throw new Error('Choose a new branch; ' + options.branch + ' already exists.');
  }
  const b = await binding(root),
    client = new Client(b.server);
  const release = checkedManifest(
    await client.call(
      '/api/harnesses/' +
        b.harnessId +
        '/manifest?ref=' +
        encodeURIComponent(options.version ?? 'latest'),
    ),
    b,
  );
  if (!release.releaseId) throw new Error('Git export requires an immutable release.');
  const files = release.files.filter((f) => selectedSyncPath(f.path, b.profiles));
  assertShareable(files);
  if (!files.length) throw new Error('This release has no native files for the selected profiles.');
  const old = await entries(root, base, b.profiles),
    removed = old.filter((e) => !files.some((f) => f.path === e.path));
  if (removed.length && !options.allowDelete)
    throw new Error(
      'Export removes ' +
        removed.length +
        ' native files from the new branch. Review and use --allow-delete.',
    );
  console.log(
    'Release ' + release.version + ' → new branch ' + options.branch + ' based on ' + base,
  );
  for (const file of files) console.log('  ' + file.path);
  for (const file of removed) console.log('  remove ' + file.path);
  console.log('  .skillshare/config.json, base.json, lock.json (exact release binding)');
  if (options.dryRun) return;
  if (!options.yes)
    throw new Error('Review with --dry-run, then use --yes to create the new branch.');
  const directory = await mkdtemp(join(tmpdir(), 'skillsync-git-'));
  try {
    const env = { GIT_INDEX_FILE: join(directory, 'index') };
    await git(root, ['read-tree', base], undefined, env);
    const records: string[] = [];
    for (const entry of removed)
      records.push('0 ' + '0'.repeat(base.length) + '\t' + entry.path + '\0');
    const selectedHash = createHash('sha256').update(canonicalTree(files)).digest('hex');
    const lock = releaseLockSchema.parse({
      schemaVersion: 2,
      harnessId: b.harnessId,
      server: b.server,
      profiles: b.profiles,
      targetReleaseId: release.releaseId,
      version: release.version,
      revision: release.revision,
      remoteTreeHash: release.treeHash,
      selectedTreeHash: selectedHash,
      baselineTreeHash: selectedHash,
      installedTreeHash: selectedHash,
      installedModes: Object.fromEntries(files.map((f) => [f.path, !!f.executable])),
      diverged: false,
      hashFormat: treeHashFormat,
    });
    const metadata = {
      '.skillshare/config.json': b,
      '.skillshare/base.json': stateUpdates(b, release.revision, files)['.skillshare/base.json'],
      '.skillshare/lock.json': lock,
    };
    const exported: SyncFile[] = [
      ...files,
      ...Object.entries(metadata).map(([path, value]) => ({
        path,
        content: JSON.stringify(value, null, 2) + '\n',
      })),
    ];
    for (const file of exported) {
      const oid = (
        await git(
          root,
          ['hash-object', '-w', '--stdin', '--no-filters'],
          Buffer.from(file.content, 'utf8'),
        )
      )
        .toString('ascii')
        .trim();
      records.push((file.executable ? '100755' : '100644') + ' ' + oid + '\t' + file.path + '\0');
    }
    await git(
      root,
      ['update-index', '-z', '--index-info'],
      Buffer.from(records.join(''), 'utf8'),
      env,
    );
    const tree = (await git(root, ['write-tree'], undefined, env)).toString('ascii').trim();
    const message =
      'SkillSync ' +
      b.harnessId +
      ' v' +
      release.version +
      '\n\nHarness-Release: ' +
      release.releaseId +
      '\nHarness-Tree: ' +
      release.treeHash +
      '\n';
    const next = (
      await git(
        root,
        ['-c', 'commit.gpgSign=false', 'commit-tree', tree, '-p', base],
        Buffer.from(message, 'utf8'),
      )
    )
      .toString('ascii')
      .trim();
    // Compare-and-swap against the absent ref: never move an existing branch.
    await git(root, [
      'update-ref',
      '--no-deref',
      '--create-reflog',
      'refs/heads/' + options.branch,
      next,
      '0'.repeat(base.length),
    ]);
    console.log(
      'Created ' +
        options.branch +
        ' at ' +
        next +
        '. Working tree and index are unchanged. Review the branch before pushing it with Git.',
    );
  } finally {
    // Only this freshly created OS temporary directory is removed.
    const parent = await realpath(tmpdir());
    const target = await realpath(directory);
    if (dirname(target) !== parent || !basename(target).startsWith('skillsync-git-'))
      throw new Error('Unexpected Git temporary directory; cleanup refused.');
    await rm(target, { recursive: true, force: true });
  }
}
