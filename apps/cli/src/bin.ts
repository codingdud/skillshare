import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, realpath } from 'node:fs/promises';
import { runtimeIds, type Binding } from '@skillshare/contracts';
import { serverURL, settings, settingsFile, atomicJSON, projectRoot, binding } from './config.js';
import { login, logout, Client } from './auth.js';
import { add, synchronize, publish, resolveConflict, repair, assertUnbound } from './sync.js';
import { recover, recoveryBinding, withWorkspaceLock } from './files.js';
import { importGit, exportGit } from './git.js';
declare const CLI_VERSION: string;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: {
    server: { type: 'string' },
    profile: { type: 'string', multiple: true },
    root: { type: 'string' },
    storage: { type: 'string' },
    'no-browser': { type: 'boolean' },
    'read-only': { type: 'boolean' },
    'link-only': { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    offline: { type: 'boolean' },
    'from-local': { type: 'boolean' },
    'ignore-crlf': { type: 'boolean' },
    'allow-delete': { type: 'boolean' },
    draft: { type: 'boolean' },
    yes: { type: 'boolean' },
    version: { type: 'string' },
    keep: { type: 'string' },
    message: { type: 'string', short: 'm' },
    notes: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    private: { type: 'boolean' },
    ref: { type: 'string' },
    branch: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});
async function main() {
  const [command, argument] = positionals;
  if (values.help || !command) {
    console.log(
      'SkillSync CLI ' +
        CLI_VERSION +
        '\n\nsetup [--server ORIGIN] [--profile NAME] [--storage auto|keyring|dpapi|file]\nauth login|status|logout\ninit --name NAME --description TEXT [--profile NAME]\nadd <harness-id> [--version X.Y.Z | --draft | --link-only] --profile NAME [--yes]\nstatus | diff [--offline] [--ignore-crlf]\npush [-m MESSAGE] [--dry-run] [--allow-delete]\npull [--version X.Y.Z | --draft] [--dry-run] [--yes] [--allow-delete]\nresolve <path> --keep local|remote [--draft | --version X.Y.Z] --yes\npublish <X.Y.Z> --notes TEXT [--dry-run | --yes]\nrepair (--version X.Y.Z | --from-local) [--dry-run | --yes]\nrecover [--dry-run]\ngit import [--ref HEAD] [-m TITLE] [--notes TEXT] [--dry-run | --yes]\ngit export --branch skillsync/NAME [--version X.Y.Z] [--ref HEAD] [--dry-run | --yes]\n\nProfiles: ' +
        runtimeIds.join(', ') +
        '\nUse --root PATH to select a codebase. Pull and add require --yes after reviewing native configuration changes.',
    );
    return;
  }
  if (values.draft && values.version) throw new Error('Choose --draft or --version, not both.');
  if (values['link-only'] && (values.draft || values.version))
    throw new Error('--link-only cannot be combined with a release selector.');
  if (
    values['dry-run'] &&
    !['add', 'push', 'pull', 'resolve', 'publish', 'recover', 'repair', 'git'].includes(command)
  )
    throw new Error('--dry-run is unsupported for ' + command + '. No action was taken.');
  if (values.offline && !['status', 'diff'].includes(command))
    throw new Error('--offline is limited to status and diff.');
  if (values['ignore-crlf'] && !['status', 'diff', 'push', 'pull', 'resolve'].includes(command))
    throw new Error('--ignore-crlf is limited to synchronization commands.');
  const common = ['root', 'help'];
  const flags: Record<string, string[]> = {
    setup: ['server', 'profile', 'storage', 'no-browser', 'read-only'],
    auth: ['server', 'storage', 'no-browser', 'read-only'],
    init: ['server', 'profile', 'name', 'description'],
    add: ['server', 'profile', 'version', 'draft', 'link-only', 'dry-run', 'yes', 'allow-delete'],
    status: ['offline', 'ignore-crlf'],
    diff: ['offline', 'ignore-crlf'],
    push: ['message', 'dry-run', 'allow-delete', 'ignore-crlf'],
    pull: ['version', 'draft', 'dry-run', 'yes', 'allow-delete', 'ignore-crlf'],
    resolve: ['keep', 'version', 'draft', 'yes', 'dry-run', 'allow-delete', 'ignore-crlf'],
    publish: ['notes', 'yes', 'dry-run'],
    recover: ['dry-run'],
    repair: ['version', 'from-local', 'yes', 'dry-run'],
    git:
      argument === 'import'
        ? ['ref', 'message', 'notes', 'yes', 'dry-run', 'allow-delete']
        : ['ref', 'branch', 'version', 'yes', 'dry-run', 'allow-delete'],
  };
  for (const flag of Object.keys(values))
    if (![...common, ...(flags[command] ?? [])].includes(flag))
      throw new Error('--' + flag + ' is unsupported for ' + command + '. No action was taken.');
  const cfg = await settings(),
    server = serverURL(values.server ?? cfg.server ?? 'http://localhost:4000');
  if (command === 'setup' || (command === 'auth' && argument === 'login')) {
    const storage = values.storage ?? 'auto';
    await login(server, {
      noBrowser: values['no-browser'],
      storage,
      readOnly: values['read-only'],
    });
    if (command === 'setup') {
      const profiles = values.profile ?? [];
      for (const profile of profiles)
        if (!(runtimeIds as readonly string[]).includes(profile))
          throw new Error('Unknown runtime profile ' + profile);
      console.log(
        'Runtime profiles: ' + (profiles.join(', ') || 'Choose profiles when using add or init.'),
      );
      console.log(
        'Next: sks add <harness-id> --profile <runtime> --link-only (upload local files) or --yes (install release).',
      );
    }
    return;
  }
  if (command === 'auth') {
    if (argument === 'logout') {
      await logout(server);
      return;
    }
    if (argument === 'status') {
      const account = cfg.accounts?.[server];
      if (!account) throw new Error('Not authenticated. Run setup.');
      const result = await new Client(server).call('/api/auth/me');
      console.log(JSON.stringify({ server, user: result.user, storage: account.storage }, null, 2));
      return;
    }
    throw new Error('Use auth login, status, or logout.');
  }
  const requestedRoot = await projectRoot(
    values.root ?? (['add', 'init'].includes(command) ? process.cwd() : undefined),
  );
  if (!values['dry-run'] && ['add', 'init'].includes(command))
    await mkdir(requestedRoot, { recursive: true });
  const root = await realpath(requestedRoot);
  if (root.toLowerCase() === resolve(homedir()).toLowerCase() || root === resolve(root, '..'))
    throw new Error('Select a codebase directory, not your home or filesystem root.');
  const mutate = async (work: () => Promise<void>) =>
    values['dry-run'] ? work() : withWorkspaceLock(root, work);
  const options = {
    dryRun: values['dry-run'],
    offline: values.offline,
    fromLocal: values['from-local'],
    ignoreCRLF: values['ignore-crlf'],
    allowDelete: values['allow-delete'],
    draft: values.draft,
    version: values.version,
    message: values.message,
    yes: values.yes,
  };
  if (command === 'git') {
    if (argument === 'import')
      await mutate(() => importGit(root, { ...options, ref: values.ref, notes: values.notes }));
    else if (argument === 'export')
      await mutate(() => exportGit(root, { ...options, ref: values.ref, branch: values.branch }));
    else throw new Error('Use git import or git export.');
    return;
  }
  if (command === 'add' || command === 'init') {
    const profiles = values.profile ?? [];
    if (!profiles.length || profiles.some((p) => !(runtimeIds as readonly string[]).includes(p)))
      throw new Error(
        'Select runtime profile(s) with --profile. Supported: ' + runtimeIds.join(', '),
      );
    if (new Set(profiles).size !== profiles.length)
      throw new Error('Select each runtime profile once.');
    if (command === 'init' && (!values.name || !values.description))
      throw new Error('init requires --name and --description (at least 10 characters).');
    if (command === 'add' && !argument) throw new Error('add requires a Harness ID.');
    await mutate(async () => {
      await assertUnbound(root);
      let id = argument;
      if (command === 'init') {
        const created = await new Client(server).call('/api/harnesses', 'POST', {
          name: values.name!,
          slug: values
            .name!.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, ''),
          description: values.description!,
          visibility: 'private',
          files: [],
        });
        id = created.id;
        console.log('Created private Harness ' + id);
      }
      await add(
        root,
        { schemaVersion: 1, server, harnessId: id!, profiles: profiles as Binding['profiles'] },
        { ...options, linkOnly: command === 'init' || values['link-only'] },
      );
    });
    return;
  }
  if (['push', 'pull', 'status', 'diff'].includes(command)) {
    const work = () => synchronize(root, command as 'push' | 'pull' | 'status' | 'diff', options);
    if (command === 'status' || command === 'diff') await work();
    else await mutate(work);
    return;
  }
  if (command === 'recover') {
    await mutate(async () => {
      let b;
      try {
        b = await binding(root);
      } catch {
        b = await recoveryBinding(root);
      }
      await recover(root, b, !!values['dry-run']);
    });
    if (!values['dry-run']) console.log('Recovery complete; review local files before retrying.');
    return;
  }
  if (command === 'resolve') {
    if (!argument || (values.keep !== 'local' && values.keep !== 'remote'))
      throw new Error(
        'resolve requires a native path and --keep local|remote. Use the same --draft or --version as the conflicting pull.',
      );
    await mutate(() => resolveConflict(root, argument, values.keep as 'local' | 'remote', options));
    return;
  }
  if (command === 'repair') {
    if (!!values.version === !!values['from-local'])
      throw new Error(
        'repair requires either --version X.Y.Z (or release ID) or an explicit --from-local choice.',
      );
    await mutate(() => repair(root, values.version!, options));
    return;
  }
  if (command === 'publish') {
    if (!argument || !values.notes || (!values.yes && !values['dry-run']))
      throw new Error(
        'publish requires version, --notes, and --yes after reviewing the full remote Harness.',
      );
    await mutate(() => publish(root, argument, values.notes!, !!values['dry-run']));
    return;
  }
  throw new Error('Unknown command ' + command + '. Use --help.');
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Command failed.');
  process.exitCode = 1;
});
