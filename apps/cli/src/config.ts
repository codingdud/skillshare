import { homedir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { mkdir, readFile, writeFile, rename, lstat, unlink, chmod } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import {
  bindingSchema,
  syncStateSchema,
  baselineSchema,
  canonicalTree,
  treeHashFormat,
  type Binding,
  type SyncFile,
} from '@skillshare/contracts';

export const userDir = () =>
  resolve(process.env.SKILLSHARE_CONFIG_DIR ?? join(homedir(), '.config', 'skillshare'));
export const serverURL = (value: string) => {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw new Error(
      'Server must be an HTTPS origin (loopback HTTP is allowed for local development).',
    );
  return url.origin;
};
export const missing = (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
export async function jsonRead<T>(file: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    if (missing(error) && fallback !== undefined) return fallback;
    throw error;
  }
}
export async function atomicText(file: string, content: string, mode = 0o600) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(file), '.skillshare-write-' + randomUUID() + '.tmp');
  try {
    await writeFile(temporary, content, { mode, flag: 'wx', flush: true });
    if (process.platform !== 'win32') await chmod(temporary, mode);
    // Antivirus/indexers can briefly hold an existing file on Windows. Never delete
    // the destination to work around this: that would lose atomic replacement.
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, file);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (
          process.platform !== 'win32' ||
          !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') ||
          attempt >= 5
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt));
      }
    }
  } finally {
    await unlink(temporary).catch((error) => {
      if (!missing(error)) throw error;
    });
  }
}
export async function atomicJSON(file: string, data: unknown) {
  await atomicText(file, JSON.stringify(data, null, 2) + '\n');
}
export type CredentialStorage = 'keyring' | 'dpapi' | 'file';
export type UserSettings = {
  server?: string;
  accounts?: Record<
    string,
    { user: { id: string; name: string; email: string }; storage: CredentialStorage }
  >;
};
export const settingsFile = () => join(userDir(), 'settings.json');
export async function settings() {
  return jsonRead<UserSettings>(settingsFile(), {});
}
export async function projectRoot(explicit?: string) {
  if (explicit) return resolve(explicit);
  let current = resolve(process.cwd());
  while (true) {
    try {
      await lstat(join(current, '.skillshare', 'config.json'));
      return current;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    const parent = dirname(current);
    if (parent === current) return resolve(process.cwd());
    current = parent;
  }
}
export async function binding(root: string): Promise<Binding> {
  const value = bindingSchema.parse(await jsonRead(join(root, '.skillshare', 'config.json')));
  value.server = serverURL(value.server);
  const known = await settings();
  if (!known.accounts?.[value.server])
    throw new Error(
      'This repository server is not authenticated. Run setup --server ' +
        value.server +
        ' before sending credentials.',
    );
  return value;
}
export type SyncState = ReturnType<typeof syncStateSchema.parse>;
export const stateFile = (root: string) => join(root, '.skillshare', 'local', 'state.json');
export const baseFile = (root: string) => join(root, '.skillshare', 'base.json');
const hash = (files: SyncFile[]) => createHash('sha256').update(canonicalTree(files)).digest('hex');
export async function state(root: string, b: Binding): Promise<SyncState> {
  const tracked = await jsonRead<unknown>(baseFile(root), null);
  const local = await jsonRead<unknown>(stateFile(root), null);
  if (local && typeof local === 'object' && 'needsRepair' in local)
    throw new Error(
      'An older recovery journal lacked baseline backups. Run repair with the prior exact --version (or explicitly reviewed --from-local) before synchronizing.',
    );
  if (tracked) {
    const base = baselineSchema.parse(tracked);
    if (
      base.treeHash !== hash(base.files) ||
      base.harnessId !== b.harnessId ||
      base.server !== b.server ||
      JSON.stringify([...base.profiles].sort()) !== JSON.stringify([...b.profiles].sort())
    )
      throw new Error(
        'Tracked baseline checksum or binding mismatch. Review config and base.json together.',
      );
    // The tracked base travels with Git branches and clones; never substitute today's draft.
    return syncStateSchema.parse({
      schemaVersion: 1,
      harnessId: base.harnessId,
      server: base.server,
      revision: base.revision,
      files: base.files,
    });
  }
  if (!local)
    throw new Error(
      'Missing sync baseline. Run repair with an exact --version, or restore tracked .skillshare/base.json.',
    );
  const result = syncStateSchema.parse(local);
  if (result.harnessId !== b.harnessId || result.server !== b.server)
    throw new Error('Binding differs from sync baseline. Review the binding and baseline.');
  return result;
}
export function stateUpdates(b: Binding, revision: number, files: SyncFile[]) {
  const value = syncStateSchema.parse({
    schemaVersion: 1,
    harnessId: b.harnessId,
    server: b.server,
    revision,
    files,
  });
  return {
    '.skillshare/base.json': {
      ...value,
      profiles: b.profiles,
      hashFormat: treeHashFormat,
      treeHash: hash(files),
    },
    '.skillshare/local/state.json': value,
  };
}
export async function saveState(root: string, b: Binding, revision: number, files: SyncFile[]) {
  for (const [path, value] of Object.entries(stateUpdates(b, revision, files)))
    await atomicJSON(join(root, path), value);
}
