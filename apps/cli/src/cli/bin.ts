import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, realpath } from 'node:fs/promises';
import { runtimeIds, harnessReleaseSchema, type Binding } from '@skillshare/contracts';
import {
  DEFAULT_SERVER,
  serverURL,
  settings,
  settingsFile,
  atomicJSON,
  projectRoot,
  binding,
  isBound,
} from '../lib/config.js';
import { login, logout, Client } from '../lib/auth.js';
import { add, synchronize, publish, resolveConflict, repair, assertUnbound } from '../lib/sync.js';
import { isInteractive, terminalPrompter } from '../lib/prompt.js';
import { latestVersion, bumpVersion, draftMatchesLatestRelease } from '../lib/release.js';
import {
  parseProfiles,
  pickProfiles,
  planNewHarness,
  createRemoteHarness,
  chooseHarness,
  type NewHarness,
} from '../lib/scaffold.js';
import { recover, recoveryBinding, withWorkspaceLock } from '../lib/files.js';
import { importGit, exportGit } from '../lib/git.js';
declare const CLI_VERSION: string;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  strict: true,
  options: {
    server: { type: 'string' },
    profile: { type: 'string', multiple: true, short: 'p' },
    visibility: { type: 'string' },
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
    yes: { type: 'boolean', short: 'y' },
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
        '\n\nsetup [--server ORIGIN] [-p NAME] [--storage auto|keyring|dpapi|file]\nauth login|status|logout\ninit [--name NAME] [--description TEXT] [--visibility private|team|public] [-p NAME] [-y]\nadd [<harness-id>] [--version X.Y.Z | --draft | --link-only] [-p NAME] [--yes]\nstatus | diff [--offline] [--ignore-crlf]\npush [-m MESSAGE] [-p NAME] [--dry-run] [--allow-delete] [-y]\npull [--version X.Y.Z | --draft] [--dry-run] [--yes] [--allow-delete]\nresolve <path> --keep local|remote [--draft | --version X.Y.Z] --yes\npublish [X.Y.Z | patch | minor | major] [--notes TEXT] [--dry-run] [-y]   (pushes local changes, bumps the version, publishes)\nrepair (--version X.Y.Z | --from-local) [--dry-run | --yes]\nrecover [--dry-run]\ngit import [--ref HEAD] [-m TITLE] [--notes TEXT] [--dry-run | --yes]\ngit export --branch skillsync/NAME [--version X.Y.Z] [--ref HEAD] [--dry-run | --yes]\n\nProfiles: ' +
        runtimeIds.join(', ') +
        ' (aliases: claude, gemini, copilot; repeat -p or comma-separate)\nUse --root PATH to select a codebase. Pull and add require --yes after reviewing native configuration changes.\nIn a terminal, init, add without an ID, and push in an unlinked folder ask for missing details with defaults; -y accepts the defaults.',
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
    init: ['server', 'profile', 'name', 'description', 'visibility', 'yes'],
    add: [
      'server',
      'profile',
      'name',
      'description',
      'visibility',
      'version',
      'draft',
      'link-only',
      'dry-run',
      'yes',
      'allow-delete',
    ],
    status: ['offline', 'ignore-crlf'],
    diff: ['offline', 'ignore-crlf'],
    push: [
      'message',
      'profile',
      'name',
      'description',
      'visibility',
      'yes',
      'dry-run',
      'allow-delete',
      'ignore-crlf',
    ],
    pull: ['version', 'draft', 'dry-run', 'yes', 'allow-delete', 'ignore-crlf'],
    resolve: ['keep', 'version', 'draft', 'yes', 'dry-run', 'allow-delete', 'ignore-crlf'],
    publish: ['notes', 'message', 'yes', 'dry-run', 'allow-delete', 'ignore-crlf'],
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
    server = serverURL(values.server ?? cfg.server ?? DEFAULT_SERVER);
  if (command === 'setup' || (command === 'auth' && argument === 'login')) {
    const storage = values.storage ?? 'auto';
    await login(server, {
      noBrowser: values['no-browser'],
      storage,
      readOnly: values['read-only'],
    });
    if (command === 'setup') {
      const profiles = parseProfiles(values.profile);
      console.log(
        'Runtime profiles: ' + (profiles.join(', ') || 'Choose profiles when using add or init.'),
      );
      console.log(
        'Next: sks push -p <runtime> (creates a Harness if none is linked), or sks add <harness-id> -p <runtime> --link-only / --yes.',
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
  const requireAccount = () => {
    if (!cfg.accounts?.[server])
      throw new Error('Not authenticated for ' + server + '. Run sks setup first.');
  };
  const given = {
    name: values.name,
    description: values.description,
    visibility: values.visibility,
    profiles: parseProfiles(values.profile),
  };
  if (command === 'add' || command === 'init') {
    const prompter = isInteractive() && !values.yes ? terminalPrompter() : null;
    try {
      await assertUnbound(root);
      let profiles = given.profiles;
      let id = argument;
      let plan: NewHarness | undefined;
      let linkOnly = command === 'init' || !!values['link-only'];
      if (command === 'add' && !id) {
        if (!prompter)
          throw new Error('add requires a Harness ID. Run it in a terminal to choose one.');
        requireAccount();
        const list = await new Client(server).call('/api/harnesses?scope=workspace');
        const picked = await chooseHarness(list.items ?? [], prompter);
        if (picked) {
          id = picked.id;
          if (!values.draft && !values.version) {
            linkOnly = true;
            prompter.say('Linking only; run sks pull to download its files.');
          }
        }
      }
      if (command === 'init' || !id) {
        if (command === 'init' && !prompter && !values.yes && (!values.name || !values.description))
          throw new Error(
            'init requires --name and --description (at least 10 characters), or run it in a terminal, or pass --yes for defaults.',
          );
        plan = await planNewHarness(root, given, prompter);
        profiles = plan.profiles;
        linkOnly = true;
      } else if (!profiles.length) {
        if (!prompter)
          throw new Error(
            'Select runtime profile(s) with -p/--profile. Supported: ' + runtimeIds.join(', '),
          );
        profiles = await pickProfiles(root, prompter);
      }
      if (plan && values['dry-run']) {
        console.log(
          'Would create ' +
            plan.visibility +
            ' Harness "' +
            plan.name +
            '" (' +
            plan.profiles.join(', ') +
            ').',
        );
        return;
      }
      await mutate(async () => {
        if (plan) {
          if (command === 'add') requireAccount();
          id = await createRemoteHarness(new Client(server), plan, prompter);
          console.log('Created ' + plan.visibility + ' Harness ' + id);
        }
        await add(
          root,
          { schemaVersion: 1, server, harnessId: id!, profiles: profiles as Binding['profiles'] },
          { ...options, linkOnly },
        );
      });
    } finally {
      prompter?.close();
    }
    return;
  }
  if (command === 'push' && !(await isBound(root))) {
    requireAccount();
    if (values['dry-run']) {
      const plan = await planNewHarness(root, given, null, { requireFiles: true });
      console.log(
        'No Harness is linked. Push would create ' +
          plan.visibility +
          ' Harness "' +
          plan.name +
          '" (' +
          plan.profiles.join(', ') +
          ') and upload the local files.',
      );
      return;
    }
    const prompter = isInteractive() && !values.yes ? terminalPrompter() : null;
    if (!prompter && !values.yes)
      throw new Error(
        'No Harness is linked to this folder. Run in a terminal to create one, pass --yes to create one with defaults, or link an existing one with sks add <id> -p <profile>.',
      );
    try {
      if (prompter) {
        prompter.say('No Harness is linked to ' + root + '.');
        if (/^n/i.test(await prompter.ask('Create one now? (Y/n)', 'y')))
          throw new Error('Nothing pushed. Link an existing Harness with sks add <id>.');
      }
      const plan = await planNewHarness(root, given, prompter, { requireFiles: true });
      await mutate(async () => {
        await assertUnbound(root);
        const id = await createRemoteHarness(new Client(server), plan, prompter);
        console.log('Created ' + plan.visibility + ' Harness ' + id);
        await add(
          root,
          { schemaVersion: 1, server, harnessId: id, profiles: plan.profiles },
          { ...options, linkOnly: true },
        );
        await synchronize(root, 'push', options);
      });
    } finally {
      prompter?.close();
    }
    return;
  }
  if (['push', 'pull', 'status', 'diff'].includes(command)) {
    if (command === 'push') {
      if (given.profiles.length) {
        const bound = (await binding(root)).profiles;
        if (JSON.stringify([...bound].sort()) !== JSON.stringify([...given.profiles].sort()))
          throw new Error(
            'This folder is linked with profile(s) ' +
              bound.join(', ') +
              '; -p ' +
              given.profiles.join(', ') +
              ' does not match. Omit -p, or link again with sks add.',
          );
      }
      if (resolve(root) !== resolve(process.cwd())) console.log('Using Harness binding at ' + root);
    }
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
    if (!(await isBound(root)))
      throw new Error('No Harness is linked to this folder. Run sks push (or sks add <id>) first.');
    const b = await binding(root);
    const client = new Client(b.server);
    const releases = await client.call('/api/harnesses/' + b.harnessId + '/releases');
    const latest = latestVersion(releases.items ?? []);
    const version = bumpVersion(latest, argument);
    const dryRun = !!values['dry-run'];
    const prompter = isInteractive() && !values.yes && !dryRun ? terminalPrompter() : null;
    if (!prompter && !values.yes && !dryRun)
      throw new Error(
        'publish pushes local changes and creates a release. Run it in a terminal to confirm, or pass --yes (use --dry-run to preview).',
      );
    try {
      let notes = values.notes ?? values.message;
      if (prompter) {
        prompter.say(
          (latest ? 'Latest release is ' + latest + '. ' : 'No release yet. ') +
            'This will publish ' +
            version +
            '.',
        );
        notes ??= await prompter.ask('Release notes', 'Release ' + version);
        if (
          /^n/i.test(
            await prompter.ask('Push local changes and publish ' + version + '? (Y/n)', 'y'),
          )
        )
          throw new Error('Nothing published.');
      }
      notes ??= 'Release ' + version;
      harnessReleaseSchema.parse({ revision: 1, version, notes });
      const pushOptions = { ...options, message: values.message ?? 'Release ' + version };
      if (dryRun) {
        await synchronize(root, 'push', pushOptions);
        console.log('Dry run: would then publish ' + version + ' ("' + notes + '").');
        return;
      }
      await mutate(async () => {
        await synchronize(root, 'push', pushOptions);
        if (latest && (await draftMatchesLatestRelease(client, b.harnessId))) {
          console.log('Nothing changed since ' + latest + '; not publishing ' + version + '.');
          return;
        }
        await publish(root, version, notes!, false);
      });
    } finally {
      prompter?.close();
    }
    return;
  }
  throw new Error('Unknown command ' + command + '. Use --help.');
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Command failed.');
  process.exitCode = 1;
});
