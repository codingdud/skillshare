import { join, resolve, relative, dirname, isAbsolute } from 'node:path';
import {
  lstat,
  realpath,
  readdir,
  mkdir,
  readFile,
  writeFile,
  unlink,
  open,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import {
  harnessFilesSchema,
  canonicalTree,
  baselineSchema,
  releaseLockSchema,
  pullJournalSchema,
  journalMetadataPaths,
  selectedSyncPath,
  assertShareable,
  type Binding,
  type SyncFile,
  type SyncChange,
} from '@skillshare/contracts';
import { atomicJSON, atomicText, jsonRead, missing } from './config.js';
export function treeHash(files: SyncFile[]) {
  return createHash('sha256').update(canonicalTree(files)).digest('hex');
}
export async function safePath(root: string, path: string) {
  const target = resolve(root, path),
    diff = relative(root, target);
  if (
    !diff ||
    diff === '..' ||
    diff.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) ||
    isAbsolute(diff)
  )
    throw new Error('Path outside selected root: ' + path);
  let current = root;
  for (const part of diff.split(/[\\/]/)) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error('Symlinks/junctions are not supported: ' + path);
      const actual = await realpath(current),
        rel = relative(root, actual);
      if (
        rel === '..' ||
        rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) ||
        isAbsolute(rel)
      )
        throw new Error('Resolved path outside root: ' + path);
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }
  return target;
}
async function nativeModes(root: string, b: Binding) {
  let modes =
    process.platform === 'win32'
      ? await jsonRead<Record<string, boolean>>(
          await safePath(root, '.skillshare/local/modes.json'),
          {},
        )
      : {};
  if (
    process.platform === 'win32' &&
    (await readText(root, '.skillshare/local/modes.json')) === null
  ) {
    const trackedLock = await jsonRead<any>(await safePath(root, '.skillshare/lock.json'), null);
    if (trackedLock?.schemaVersion === 2) {
      const lock = releaseLockSchema.parse(trackedLock);
      if (lock.harnessId !== b.harnessId || lock.server !== b.server)
        throw new Error('Executable metadata binding mismatch.');
      modes = lock.installedModes ?? {};
    } else {
      const trackedBase = await jsonRead<unknown>(
        await safePath(root, '.skillshare/base.json'),
        null,
      );
      if (trackedBase) {
        const base = baselineSchema.parse(trackedBase);
        if (
          base.harnessId !== b.harnessId ||
          base.server !== b.server ||
          treeHash(base.files) !== base.treeHash
        )
          throw new Error('Executable baseline checksum or binding mismatch.');
        modes = Object.fromEntries(base.files.map((f) => [f.path, !!f.executable]));
      }
    }
  }
  return modes;
}
export async function scan(root: string, b: Binding): Promise<SyncFile[]> {
  const result: SyncFile[] = [];
  const modes = await nativeModes(root, b);
  async function walk(path: string) {
    const target = await safePath(root, path);
    let info;
    try {
      info = await lstat(target);
    } catch (error) {
      if (missing(error)) return;
      throw error;
    }
    if (info.isDirectory()) {
      if (/(^|\/)(node_modules|\.git|tmp|cache|logs|sessions|session-state)$/.test(path)) return;
      for (const name of await readdir(target)) await walk(path + '/' + name);
    } else if (info.isFile() && selectedSyncPath(path, b.profiles)) {
      if (info.size > 250000) throw new Error('File exceeds 250 KB: ' + path);
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(target));
      result.push({
        path,
        content,
        executable: process.platform === 'win32' ? modes[path] === true : !!(info.mode & 0o111),
      });
      if (result.length > 1000) throw new Error('More than 1,000 selected files.');
    }
  }
  for (const path of [
    '.claude',
    '.gemini',
    '.github',
    '.vscode',
    '.agents',
    'CLAUDE.md',
    'GEMINI.md',
    'AGENTS.md',
    '.mcp.json',
  ]) {
    // Skip entire unrelated roots rather than reading another runtime's state.
    if (path === '.claude' && !b.profiles.includes('claude-code')) continue;
    if (path === '.gemini' && !b.profiles.includes('gemini-cli')) continue;
    if (['.github', '.vscode'].includes(path) && !b.profiles.some((p) => p.startsWith('copilot')))
      continue;
    await walk(path);
  }
  harnessFilesSchema.parse(result);
  assertShareable(result);
  return result;
}
export async function ensureMetadata(root: string) {
  await safePath(root, '.skillshare/local/state.json');
  await mkdir(join(root, '.skillshare', 'local'), { recursive: true, mode: 0o700 });
  const ignore = join(root, '.gitignore');
  await safePath(root, '.gitignore');
  let original = '';
  try {
    original = await readFile(ignore, 'utf8');
  } catch (e) {
    if (!missing(e)) throw e;
  }
  if (
    !original
      .split(/\r?\n/)
      .some((line) =>
        ['.skillshare/local/', '/.skillshare/local/', '.skillshare/'].includes(line.trim()),
      )
  )
    await writeFile(
      ignore,
      original +
        (original.endsWith('\n') || !original ? '' : '\n') +
        '\n# SkillShare local synchronization state and recovery backups\n/.skillshare/local/\n',
    );
}
type Journal = ReturnType<typeof pullJournalSchema.parse>;
export const journalFile = (root: string) => join(root, '.skillshare/local/pull-journal.json');
async function readText(root: string, path: string) {
  try {
    return await readFile(await safePath(root, path), 'utf8');
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}
export async function beginPull(
  root: string,
  b: Binding,
  changes: SyncChange[],
  expected: SyncFile[],
) {
  await safePath(root, '.skillshare/local/pull-journal.json');
  const journal: Journal = {
    schemaVersion: 2,
    operationId: randomUUID(),
    binding: b,
    phase: 'prepared',
    changes,
    before: expected,
    completed: [],
    rolledBack: [],
    initialModes: await nativeModes(root, b),
    metadata: await Promise.all(
      journalMetadataPaths.map(async (path) => ({ path, before: await readText(root, path) })),
    ),
  };
  await atomicJSON(journalFile(root), pullJournalSchema.parse(journal));
  return journal;
}
// Read only the touched path before replacement, rather than rescanning the whole tree.
async function readNative(root: string, path: string, b: Binding): Promise<SyncFile | undefined> {
  const target = await safePath(root, path);
  try {
    const info = await lstat(target);
    if (!info.isFile()) throw new Error('Expected a native file: ' + path);
    const modes = await nativeModes(root, b);
    return {
      path,
      content: new TextDecoder('utf-8', { fatal: true }).decode(await readFile(target)),
      executable: process.platform === 'win32' ? modes[path] === true : !!(info.mode & 0o111),
    };
  } catch (error) {
    if (missing(error)) return undefined;
    throw error;
  }
}
const same = (a?: SyncFile, b?: SyncFile) => treeHash(a ? [a] : []) === treeHash(b ? [b] : []);
export async function applyPull(
  root: string,
  b: Binding,
  changes: SyncChange[],
  expected: SyncFile[],
) {
  const combined = new Map(expected.map((f) => [f.path, f]));
  for (const change of changes) {
    if (!selectedSyncPath(change.path, b.profiles)) throw new Error('Unmanaged pull path.');
    if (change.after) combined.set(change.path, change.after);
    else combined.delete(change.path);
  }
  harnessFilesSchema.parse([...combined.values()]);
  assertShareable(changes.flatMap((c) => (c.after ? [c.after] : [])));
  const journal = await beginPull(root, b, changes, expected);
  journal.phase = 'applying';
  await atomicJSON(journalFile(root), journal);
  const originals = new Map(expected.map((f) => [f.path, f]));
  for (const change of changes) {
    if (!same(await readNative(root, change.path, b), originals.get(change.path)))
      throw new Error(
        'Local file changed during pull: ' +
          change.path +
          '. Use recover to restore interrupted writes.',
      );
    journal.inProgress = change.path;
    await atomicJSON(journalFile(root), journal);
    await writeChange(root, change, b);
    journal.completed.push(change.path);
    delete journal.inProgress;
    await atomicJSON(journalFile(root), journal);
  }
}
async function writeChange(root: string, change: SyncChange, b: Binding) {
  const target = await safePath(root, change.path);
  if (change.after) {
    await mkdir(dirname(target), { recursive: true });
    await safePath(root, change.path);
    await atomicText(target, change.after.content, change.after.executable ? 0o755 : 0o644);
  } else
    await unlink(target).catch((error) => {
      if (!missing(error)) throw error;
    });
  // Contents are replaced first. Recovery handles interruption before this mode update.
  if (process.platform === 'win32') {
    const modeFile = await safePath(root, '.skillshare/local/modes.json');
    const modes = await nativeModes(root, b);
    if (change.after) modes[change.path] = !!change.after.executable;
    else delete modes[change.path];
    await atomicJSON(modeFile, modes);
  }
}
export async function finishPull(
  root: string,
  updates: Partial<Record<(typeof journalMetadataPaths)[number], unknown>>,
) {
  const journal = pullJournalSchema.parse(await jsonRead(journalFile(root)));
  for (const entry of journal.metadata)
    if (entry.path in updates) {
      if ((await readText(root, entry.path)) !== entry.before)
        throw new Error('Synchronization metadata changed during pull: ' + entry.path);
      entry.after = JSON.stringify(updates[entry.path], null, 2) + '\n';
    }
  await atomicJSON(journalFile(root), journal);
  for (const entry of journal.metadata)
    if (entry.after !== undefined && entry.after !== null)
      await atomicText(await safePath(root, entry.path), entry.after);
  journal.phase = 'committed';
  await atomicJSON(journalFile(root), journal);
  await unlink(journalFile(root));
}
export async function recoveryBinding(root: string): Promise<Binding> {
  const data = await jsonRead<any>(await safePath(root, '.skillshare/local/pull-journal.json'));
  return pullJournalSchema.parse(data).binding;
}
export async function recover(root: string, b: Binding, dryRun = false) {
  const data = await jsonRead<any>(await safePath(root, '.skillshare/local/pull-journal.json'));
  // Support old interrupted journals, but they did not capture metadata. Preserve that limitation explicitly.
  const journal: Journal =
    data.schemaVersion === 2
      ? pullJournalSchema.parse(data)
      : pullJournalSchema.parse({
          ...data,
          schemaVersion: 2,
          operationId: randomUUID(),
          binding: b,
          phase: 'applying',
          rolledBack: [],
          metadata: [],
          requiresRepair: true,
        });
  if (
    journal.binding.harnessId !== b.harnessId ||
    journal.binding.server !== b.server ||
    JSON.stringify(journal.binding.profiles) !== JSON.stringify(b.profiles)
  )
    throw new Error('Recovery binding mismatch.');
  for (const change of journal.changes)
    if (!selectedSyncPath(change.path, b.profiles))
      throw new Error('Recovery journal contains an unmanaged path.');
  if (journal.phase === 'committed') {
    console.log('Pull committed; finalize recovery journal.');
    if (!dryRun) await unlink(journalFile(root));
    return;
  }
  const touched = [
    ...new Set([...journal.completed, ...(journal.inProgress ? [journal.inProgress] : [])]),
  ];
  const originals = new Map(journal.before.map((f) => [f.path, f]));
  const changes = new Map(journal.changes.map((c) => [c.path, c]));
  for (const path of touched) {
    const actual = await readNative(root, path, b),
      before = originals.get(path),
      after = changes.get(path)?.after;
    // Original bytes are a valid already-restored state. On Windows the in-progress write can have the old mode.
    const splitMode =
      process.platform === 'win32' &&
      ((journal.inProgress === path &&
        actual?.content === after?.content &&
        !!actual?.executable === !!before?.executable) ||
        (journal.rollbackInProgress === path &&
          actual?.content === before?.content &&
          !!actual?.executable === !!after?.executable));
    if (!same(actual, before) && !same(actual, after) && !splitMode)
      throw new Error(
        'Recovery blocked: ' +
          path +
          ' changed after pull. Backup is preserved in ' +
          journalFile(root),
      );
  }
  for (const entry of journal.metadata) {
    if (entry.path.endsWith('/modes.json')) {
      const actual = await readText(root, entry.path);
      const signature = (text: string | null) =>
        text === null
          ? 'missing'
          : JSON.stringify(Object.entries(JSON.parse(text)).sort(([a], [b]) => a.localeCompare(b)));
      const modes: Record<string, boolean> = entry.before
        ? JSON.parse(entry.before)
        : { ...journal.initialModes };
      const allowed = new Set([signature(entry.before)]);
      // Inherited mode hints are not a file on disk until the first native write.
      if (entry.before === null) allowed.add(signature(JSON.stringify(modes)));
      for (const path of touched) {
        const after = changes.get(path)?.after;
        if (after) modes[path] = !!after.executable;
        else delete modes[path];
        allowed.add(signature(JSON.stringify(modes)));
      }
      for (const path of [...touched].reverse()) {
        const before = originals.get(path);
        if (before) modes[path] = !!before.executable;
        else delete modes[path];
        allowed.add(signature(JSON.stringify(modes)));
      }
      if (!allowed.has(signature(actual)))
        throw new Error('Recovery blocked: executable metadata changed after pull.');
      continue;
    }
    const actual = await readText(root, entry.path);
    if (actual !== entry.before && (entry.after === undefined || actual !== entry.after))
      throw new Error('Recovery blocked: metadata changed after pull: ' + entry.path);
  }
  console.log('Recovery will restore ' + touched.length + ' file(s) and synchronization metadata.');
  if (dryRun) return;
  journal.phase = 'rolling-back';
  await atomicJSON(journalFile(root), journal);
  for (const path of [...touched].reverse()) {
    const actual = await readNative(root, path, b),
      before = originals.get(path),
      after = changes.get(path)?.after;
    const splitMode =
      process.platform === 'win32' &&
      ((journal.inProgress === path &&
        actual?.content === after?.content &&
        !!actual?.executable === !!before?.executable) ||
        (journal.rollbackInProgress === path &&
          actual?.content === before?.content &&
          !!actual?.executable === !!after?.executable));
    if (!same(actual, before) && !same(actual, after) && !splitMode)
      throw new Error('Recovery blocked: file changed during recovery: ' + path);
    if (!same(actual, before)) {
      journal.rollbackInProgress = path;
      await atomicJSON(journalFile(root), journal);
      await writeChange(root, { path, after: before }, b);
    }
    delete journal.rollbackInProgress;
    if (!journal.rolledBack.includes(path)) journal.rolledBack.push(path);
    await atomicJSON(journalFile(root), journal);
  }
  for (const entry of journal.metadata) {
    const target = await safePath(root, entry.path);
    if (entry.before === null)
      await unlink(target).catch((e) => {
        if (!missing(e)) throw e;
      });
    else if ((await readText(root, entry.path)) !== entry.before)
      await atomicText(target, entry.before);
  }
  if (journal.requiresRepair) {
    const backup = await safePath(
      root,
      '.skillshare/local/legacy-recovery-' + journal.operationId + '.json',
    );
    if ((await jsonRead(backup, null)) === null)
      await atomicJSON(backup, {
        journal,
        state: await readText(root, '.skillshare/local/state.json'),
        base: await readText(root, '.skillshare/base.json'),
      });
    await atomicJSON(await safePath(root, '.skillshare/local/state.json'), {
      needsRepair: true,
      harnessId: b.harnessId,
      server: b.server,
    });
    console.log(
      'Legacy journal had no metadata backup. Native files restored; run repair with the prior exact release, or explicitly reviewed --from-local, before syncing. A backup is retained in ' +
        backup,
    );
  }
  await unlink(journalFile(root));
}

export async function withWorkspaceLock<T>(root: string, work: () => Promise<T>): Promise<T> {
  await ensureMetadata(root);
  const file = await safePath(root, '.skillshare/local/operation.lock');
  let handle;
  try {
    handle = await open(file, 'wx', 0o600);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
      throw new Error(
        'Another CLI operation holds ' +
          file +
          '. If it was interrupted, confirm that process has stopped before removing this lock; then run recover if a pull journal exists.',
      );
    throw error;
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
    return await work();
  } finally {
    await handle.close();
    await unlink(file);
  }
}
