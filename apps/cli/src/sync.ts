import { join } from 'node:path';
import { lstat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  manifestSchema,
  releaseLockSchema,
  legacyReleaseLockSchema,
  changesetSchema,
  harnessReleaseSchema,
  inspectHarnessTree,
  treeHashFormat,
  equalSyncFile,
  pendingPushSchema,
  cachedManifestSchema,
  bindingSchema,
  compareSync,
  selectedSyncPath,
  assertShareable,
  type Binding,
  type SyncFile,
} from '@skillshare/contracts';
import { Client, ApiError } from './auth.js';
import { atomicJSON, binding, state, stateUpdates, jsonRead, missing } from './config.js';
import {
  scan,
  ensureMetadata,
  applyPull,
  beginPull,
  finishPull,
  journalFile,
  safePath,
  treeHash,
} from './files.js';

export type Options = {
  dryRun?: boolean;
  offline?: boolean;
  fromLocal?: boolean;
  ignoreCRLF?: boolean;
  allowDelete?: boolean;
  draft?: boolean;
  version?: string;
  message?: string;
  yes?: boolean;
};
const filter = (files: SyncFile[], b: Binding) =>
  files.filter((f) => selectedSyncPath(f.path, b.profiles));
function manifest(data: unknown, b: Binding) {
  const value = manifestSchema.parse(data);
  if (value.harnessId !== b.harnessId) throw new Error('Mismatched remote manifest.');
  if (treeHash(value.files) !== value.treeHash)
    throw new Error('Remote snapshot checksum mismatch.');
  return value;
}
async function noJournal(root: string) {
  await safePath(root, '.skillshare/local/pull-journal.json');
  try {
    await lstat(journalFile(root));
    throw new Error('An interrupted pull exists. Run recover before another operation.');
  } catch (error) {
    if (!missing(error)) throw error;
  }
}
function show(direction: string, result: ReturnType<typeof compareSync>) {
  console.log(direction + ': ' + result.changes.length + ' change(s)');
  for (const c of result.changes)
    console.log((!c.after ? 'DELETE' : !c.before ? 'ADD' : 'MODIFY') + ' ' + c.path);
  for (const path of result.conflicts) console.log('CONFLICT ' + path);
  if (result.changes.some((c) => c.after && /hooks|mcp|settings/.test(c.path)))
    console.log(
      'Review MCP processes, hook commands, and permission settings before applying. Native runtimes may use these on their next session.',
    );
}
function checked(result: ReturnType<typeof compareSync>, options: Options) {
  if (result.conflicts.length)
    throw new Error(
      'Conflicting edits retained. Resolve the listed files against the local baseline and remote snapshot before retrying.',
    );
  if (result.changes.some((c) => !c.after) && !options.allowDelete)
    throw new Error('Deletions require --allow-delete after reviewing --dry-run.');
}
function lockUpdates(
  b: Binding,
  remote: ReturnType<typeof manifest>,
  local: SyncFile[],
  base: SyncFile[],
) {
  return {
    '.skillshare/lock.json': releaseLockSchema.parse({
      schemaVersion: 2,
      harnessId: b.harnessId,
      server: b.server,
      profiles: b.profiles,
      targetReleaseId: remote.releaseId,
      version: remote.version,
      revision: remote.revision,
      remoteTreeHash: remote.treeHash,
      selectedTreeHash: treeHash(filter(remote.files, b)),
      baselineTreeHash: treeHash(base),
      installedTreeHash: treeHash(local),
      installedModes: Object.fromEntries(local.map((f) => [f.path, !!f.executable])),
      diverged: treeHash(local) !== treeHash(filter(remote.files, b)),
      hashFormat: treeHashFormat,
    }),
  };
}
async function lockRef(root: string, b: Binding) {
  const data = await jsonRead<any>(await safePath(root, '.skillshare/lock.json'), null);
  if (!data) return undefined;
  if (data.schemaVersion === 2) {
    const lock = releaseLockSchema.parse(data);
    if (
      lock.harnessId !== b.harnessId ||
      lock.server !== b.server ||
      JSON.stringify([...lock.profiles].sort()) !== JSON.stringify([...b.profiles].sort())
    )
      throw new Error('Release target belongs to a different binding.');
    return lock.targetReleaseId;
  }
  // Legacy pins are migrated on the next successful operation.
  const legacy = legacyReleaseLockSchema.parse(data);
  if (legacy.harnessId !== b.harnessId || legacy.server !== b.server)
    throw new Error('Legacy release lock belongs to a different binding.');
  return legacy.releaseId;
}
async function loadState(root: string, b: Binding, client: Client) {
  try {
    return await state(root, b);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('Missing sync baseline'))
      throw error;
    const pinned = await lockRef(root, b);
    if (!pinned) throw error;
    const remote = manifest(
      await client.call(
        '/api/harnesses/' + b.harnessId + '/manifest?ref=' + encodeURIComponent(pinned),
      ),
      b,
    );
    if (!remote.releaseId)
      throw new Error('Baseline recovery requires an immutable published release.');
    return {
      schemaVersion: 1 as const,
      harnessId: b.harnessId,
      server: b.server,
      revision: remote.revision,
      files: filter(remote.files, b),
    };
  }
}
// Only advance each path's baseline when local and remote agree; otherwise future pulls must still see remote-only edits.
function nextBaseline(base: SyncFile[], local: SyncFile[], remote: SyncFile[], ignoreCRLF = false) {
  const locals = new Map(local.map((f) => [f.path, f])),
    remotes = new Map(remote.map((f) => [f.path, f]));
  const result = new Map(base.map((f) => [f.path, f]));
  for (const path of new Set([...base, ...local, ...remote].map((f) => f.path))) {
    const l = locals.get(path),
      r = remotes.get(path);
    if (equalSyncFile(l, r, ignoreCRLF)) {
      if (r) result.set(path, r);
      else result.delete(path);
    }
  }
  return [...result.values()];
}
export async function assertUnbound(root: string) {
  await noJournal(root);
  await safePath(root, '.skillshare/config.json');
  try {
    await lstat(join(root, '.skillshare/config.json'));
    throw new Error(
      'This codebase already has a Harness binding. Remove it deliberately before binding another Harness.',
    );
  } catch (error) {
    if (!missing(error)) throw error;
  }
}
export async function add(root: string, b: Binding, options: Options & { linkOnly?: boolean }) {
  bindingSchema.parse(b);
  await assertUnbound(root);
  const client = new Client(b.server);
  const remote = manifest(
    await client.call(
      '/api/harnesses/' +
        b.harnessId +
        '/manifest?ref=' +
        encodeURIComponent(
          options.linkOnly || options.draft ? 'draft' : (options.version ?? 'latest'),
        ),
    ),
    b,
  );
  const files = filter(remote.files, b);
  assertShareable(files);
  const local = await scan(root, b);
  const result = compareSync([], local, files, 'pull', options.ignoreCRLF);
  show(options.linkOnly ? 'Link only (native files unchanged)' : 'Install', result);
  if (options.dryRun) return;
  if (!options.linkOnly) {
    checked(result, options);
    if (result.changes.length && !options.yes)
      throw new Error('Review --dry-run, then pass --yes to install native files.');
  } else if (!remote.canWrite)
    throw new Error('Link-only requires write access to the Harness draft.');
  await ensureMetadata(root);
  if (!options.linkOnly) await applyPull(root, b, result.changes, local);
  if (options.linkOnly) await beginPull(root, b, [], local);
  const installed = await scan(root, b);
  await finishPull(root, {
    '.skillshare/config.json': b,
    ...stateUpdates(b, remote.revision, files),
    ...lockUpdates(b, remote, installed, files),
  });
  console.log('Bound Harness ' + b.harnessId + '. Local state is ignored by Git.');
}
export async function synchronize(
  root: string,
  direction: 'push' | 'pull' | 'status' | 'diff',
  options: Options,
) {
  await noJournal(root);
  const b = await binding(root),
    client = new Client(b.server),
    baseline = options.offline ? await state(root, b) : await loadState(root, b, client);
  const pinned = await lockRef(root, b);
  const ref =
    direction === 'push' || direction === 'status' || direction === 'diff' || options.draft
      ? 'draft'
      : (options.version ?? pinned ?? 'latest');
  let data;
  const cacheFile = await safePath(root, '.skillshare/local/remote.json');
  if (options.offline) {
    if (!['status', 'diff'].includes(direction))
      throw new Error('--offline is limited to status and diff.');
    const cache = cachedManifestSchema.parse(await jsonRead(cacheFile));
    if (JSON.stringify(cache.binding) !== JSON.stringify(b))
      throw new Error('Cached remote belongs to a different binding.');
    data = cache.manifest;
    console.log('OFFLINE: last fetched ' + cache.fetchedAt + '; remote may have changed.');
  } else
    try {
      data = await client.call(
        '/api/harnesses/' + b.harnessId + '/manifest?ref=' + encodeURIComponent(ref),
      );
    } catch (error) {
      if (
        (direction === 'status' || direction === 'diff') &&
        error instanceof ApiError &&
        error.status === 404
      )
        data = await client.call(
          '/api/harnesses/' +
            b.harnessId +
            '/manifest?ref=' +
            encodeURIComponent(pinned ?? 'latest'),
        );
      else throw error;
    }
  const remote = manifest(data, b);
  if (!options.offline && !options.dryRun)
    await atomicJSON(cacheFile, {
      binding: b,
      fetchedAt: new Date().toISOString(),
      manifest: remote,
    });
  const local = await scan(root, b),
    files = filter(remote.files, b);
  assertShareable(files);
  const result = compareSync(
    filter(baseline.files, b),
    local,
    files,
    direction === 'pull' ? 'pull' : 'push',
    options.ignoreCRLF,
  );
  const pendingFile = join(root, '.skillshare/local/push-request.json');
  await safePath(root, '.skillshare/local/push-request.json');
  const pending = direction === 'push' ? await jsonRead<unknown>(pendingFile, null) : null;
  let previous = pending ? (changesetSchema.safeParse(pending).data ?? null) : null;
  if (pending && !previous) {
    const recorded = pendingPushSchema.parse(pending);
    if (JSON.stringify(recorded.binding) !== JSON.stringify(b))
      throw new Error('Pending push belongs to a different binding.');
    previous = recorded.request;
  }
  if (
    previous &&
    (JSON.stringify([...previous.profiles].sort()) !== JSON.stringify([...b.profiles].sort()) ||
      [...previous.upsert.map((f) => f.path), ...previous.remove].some(
        (p) => !selectedSyncPath(p, b.profiles),
      ))
  )
    throw new Error('Pending push differs from the selected binding.');
  if (direction === 'pull' && (await jsonRead(pendingFile, null)))
    throw new Error('Finish the pending push before pulling.');
  if (options.ignoreCRLF)
    console.log(
      'CRLF and LF are treated as equivalent; incoming changed files retain remote line endings.',
    );
  show(direction, result);
  console.log(
    'Remote target ' +
      (remote.version ?? 'draft') +
      ' at revision ' +
      remote.revision +
      (treeHash(local) === treeHash(files)
        ? '; local tree matches exactly.'
        : '; local tree diverges (local edits or pending remote changes).'),
  );
  if (direction === 'status' || direction === 'diff') {
    const pull = compareSync(filter(baseline.files, b), local, files, 'pull', options.ignoreCRLF);
    show('Remote changes', pull);
    if (direction === 'diff')
      for (const c of [...result.changes, ...pull.changes]) {
        console.log(
          '\n--- ' +
            c.path +
            '\n' +
            (c.before?.content ?? '(absent)') +
            '\n+++ ' +
            c.path +
            '\n' +
            (c.after?.content ?? '(absent)'),
        );
      }
    if (direction === 'diff')
      for (const path of result.conflicts) {
        console.log(
          '\nCONFLICT ' +
            path +
            '\n--- BASE\n' +
            (baseline.files.find((f) => f.path === path)?.content ?? '(absent)') +
            '\n--- LOCAL\n' +
            (local.find((f) => f.path === path)?.content ?? '(absent)') +
            '\n--- REMOTE\n' +
            (files.find((f) => f.path === path)?.content ?? '(absent)'),
        );
      }
    return;
  }
  if (options.dryRun) return;
  if (!previous) checked(result, options);
  if (direction === 'pull') {
    if (result.changes.length && !options.yes)
      throw new Error('Review pull --dry-run, then pass --yes to apply native file changes.');
    await ensureMetadata(root);
    await applyPull(root, b, result.changes, local);
    const after = await scan(root, b);
    const next = nextBaseline(baseline.files, after, files, options.ignoreCRLF);
    await finishPull(root, {
      ...stateUpdates(b, remote.revision, next),
      ...lockUpdates(b, remote, after, next),
    });
    console.log('Pull complete. Unrelated files and local-only edits were preserved.');
    return;
  }
  if (!remote.canWrite)
    throw new Error(
      'Draft editing access is required. Protected Harnesses require a change proposal; use sks git import.',
    );
  const payload = changesetSchema.parse({
    revision: remote.revision,
    requestId: randomUUID(),
    profiles: b.profiles,
    message: options.message ?? 'Update native files',
    upsert: result.changes.flatMap((c) => (c.after ? [c.after] : [])),
    remove: result.changes.filter((c) => !c.after).map((c) => c.path),
  });
  const request = previous ?? payload;
  if (previous)
    console.log(
      'Recovering the previous push using its idempotency key; rerun push for subsequent edits.',
    );
  await atomicJSON(pendingFile, pendingPushSchema.parse({ schemaVersion: 2, binding: b, request }));
  let response;
  try {
    response = await client.call('/api/harnesses/' + b.harnessId + '/changesets', 'POST', request);
  } catch (error) {
    if (error instanceof ApiError && [400, 409, 413, 422].includes(error.status))
      await unlink(pendingFile);
    throw error;
  }
  const saved = manifest(response, b);
  const next = new Map(
    nextBaseline(baseline.files, local, filter(saved.files, b), options.ignoreCRLF).map((f) => [
      f.path,
      f,
    ]),
  );
  // An acknowledged submission becomes the base even when the editor has already changed it again.
  for (const f of request.upsert) next.set(f.path, f);
  for (const path of request.remove) next.delete(path);
  await beginPull(root, b, [], local);
  await finishPull(root, {
    ...stateUpdates(b, saved.revision, [...next.values()]),
    ...lockUpdates(b, saved, local, [...next.values()]),
  });
  await unlink(pendingFile);
  console.log('Pushed revision ' + saved.revision + '. Publish separately to share a release.');
}
export async function publish(root: string, version: string, notes: string, dryRun = false) {
  harnessReleaseSchema.parse({ revision: 1, version, notes });
  await noJournal(root);
  const b = await binding(root),
    client = new Client(b.server);
  const remote = manifest(
    await client.call('/api/harnesses/' + b.harnessId + '/manifest?ref=draft'),
    b,
  );
  const local = await scan(root, b);
  if (treeHash(local) !== treeHash(filter(remote.files, b)))
    throw new Error(
      'Local managed files differ from the remote draft. Push/pull and review before publishing.',
    );
  assertShareable(remote.files);
  const inspection = inspectHarnessTree(remote.files);
  const error = inspection.issues.find((issue) => issue.severity === 'error');
  if (error)
    throw new Error(
      'Fix native configuration before publication: ' + error.path + ': ' + error.message,
    );
  console.log('Release includes ' + inspection.components.length + ' native components.');
  for (const f of remote.files)
    console.log(
      'RELEASE ' + f.path + (selectedSyncPath(f.path, b.profiles) ? '' : ' (unselected profile)'),
    );
  console.log(
    'Publishing complete Harness revision ' +
      remote.revision +
      ' (' +
      remote.files.length +
      ' files, including unselected profiles).',
  );
  const baseline = await loadState(root, b, client);
  if (await jsonRead(await safePath(root, '.skillshare/local/push-request.json'), null))
    throw new Error('Finish the pending push before publication.');
  if (dryRun) return;
  const result = await client.call('/api/harnesses/' + b.harnessId + '/releases', 'POST', {
    revision: remote.revision,
    version,
    notes,
    treeHash: remote.treeHash,
  });
  await beginPull(root, b, [], local);
  await finishPull(
    root,
    lockUpdates(
      b,
      { ...remote, releaseId: result.id, version: result.version },
      local,
      baseline.files,
    ),
  );
  console.log('Published ' + result.version + '.');
}

export async function resolveConflict(
  root: string,
  path: string,
  keep: 'local' | 'remote',
  options: Options,
) {
  await noJournal(root);
  const b = await binding(root),
    baseline = await loadState(root, b, new Client(b.server));
  if (!selectedSyncPath(path, b.profiles)) throw new Error('Select a managed native file path.');
  const pinned = await lockRef(root, b);
  const ref = options.draft ? 'draft' : (options.version ?? pinned ?? 'latest');
  const remote = manifest(
    await new Client(b.server).call(
      '/api/harnesses/' + b.harnessId + '/manifest?ref=' + encodeURIComponent(ref),
    ),
    b,
  );
  const files = filter(remote.files, b);
  assertShareable(files);
  const local = await scan(root, b);
  if (
    !compareSync(baseline.files, local, files, 'pull', options.ignoreCRLF).conflicts.includes(path)
  )
    throw new Error('This path has no conflict against the selected remote snapshot.');
  const own = local.find((f) => f.path === path),
    incoming = files.find((f) => f.path === path);
  console.log('Resolve ' + path + ': keep ' + keep + ' against revision ' + remote.revision);
  if (options.dryRun) return;
  if (!options.yes)
    throw new Error('Inspect diff first, then pass --yes to record this conflict decision.');
  if (keep === 'remote' && !incoming && !options.allowDelete)
    throw new Error('Accepting a remote deletion requires --allow-delete.');
  if (keep === 'remote') await applyPull(root, b, [{ path, before: own, after: incoming }], local);
  const next = baseline.files.filter((f) => f.path !== path);
  if (incoming) next.push(incoming);
  if (keep === 'local') await beginPull(root, b, [], local);
  await finishPull(root, {
    ...stateUpdates(b, remote.revision, next),
    ...lockUpdates(b, remote, await scan(root, b), next),
  });
  console.log(
    'Conflict decision saved. Rerun pull with the same ref, or push --dry-run to review your retained local change.',
  );
}

export async function repair(root: string, version: string | undefined, options: Options) {
  await noJournal(root);
  if (!options.fromLocal && (!version || version === 'draft' || version === 'latest'))
    throw new Error('repair requires an exact --version X.Y.Z or release ID.');
  const b = await binding(root);
  const remote = manifest(
    await new Client(b.server).call(
      '/api/harnesses/' +
        b.harnessId +
        '/manifest?ref=' +
        encodeURIComponent(options.fromLocal ? 'draft' : version!),
    ),
    b,
  );
  if (!options.fromLocal && !remote.releaseId)
    throw new Error('Select an immutable published release.');
  const local = await scan(root, b),
    files = options.fromLocal ? local : filter(remote.files, b);
  if (options.fromLocal) {
    console.log(
      'Explicitly adopting the current local tree as the comparison base; it is not a historical server snapshot. Future remote changes require reviewed pull.',
    );
    show(
      'Remote differences from the chosen local base',
      compareSync(local, local, filter(remote.files, b), 'pull'),
    );
  }
  show('Repair baseline (native files unchanged)', compareSync(files, local, files, 'push'));
  if (options.dryRun) return;
  if (!options.yes)
    throw new Error('Review repair --dry-run, then pass --yes to adopt this exact baseline.');
  await beginPull(root, b, [], local);
  await finishPull(root, {
    ...stateUpdates(b, remote.revision, files),
    ...lockUpdates(b, remote, local, files),
  });
}
