import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { runtimeIds, legacyHarnesses, harnesses, type Binding } from '@skillshare/contracts';
import { ApiError, type Client } from './auth.js';
import type { Prompter } from './prompt.js';

export type Profile = Binding['profiles'][number];
export type Visibility = 'private' | 'team' | 'public';
export type NewHarness = {
  name: string;
  description: string;
  visibility: Visibility;
  profiles: Profile[];
};
export type Given = {
  name?: string;
  description?: string;
  visibility?: string;
  profiles?: Profile[];
};

const visibilities: readonly string[] = ['private', 'team', 'public'];

export function parseProfiles(input: readonly string[] = []): Profile[] {
  const result: Profile[] = [];
  for (const raw of input.flatMap((value) => value.split(','))) {
    const name = raw.trim();
    if (!name) continue;
    const id =
      name in legacyHarnesses ? legacyHarnesses[name as keyof typeof legacyHarnesses] : name;
    if (!(runtimeIds as readonly string[]).includes(id))
      throw new Error(
        'Unknown runtime profile "' +
          name +
          '". Supported: ' +
          runtimeIds.join(', ') +
          ' (aliases: claude, gemini, copilot).',
      );
    if (!result.includes(id as Profile)) result.push(id as Profile);
  }
  return result;
}

const isDir = (path: string) =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );
const isFile = (path: string) =>
  stat(path).then(
    (s) => s.isFile(),
    () => false,
  );

export async function detectProfiles(root: string): Promise<Profile[]> {
  const found: Profile[] = [];
  if (await isDir(join(root, '.claude'))) found.push('claude-code');
  if (await isDir(join(root, '.gemini'))) found.push('gemini-cli');
  const github = join(root, '.github');
  const copilot = await Promise.all([
    ...['agents', 'instructions', 'skills', 'hooks', 'prompts'].map((d) => isDir(join(github, d))),
    isFile(join(github, 'copilot-instructions.md')),
  ]);
  if (copilot.some(Boolean)) found.push('copilot-vscode');
  return found;
}

export async function missingRoots(root: string, profiles: readonly Profile[]) {
  const roots = [...new Set(profiles.map((p) => harnesses[p].root))];
  const present = await Promise.all(roots.map((r) => isDir(join(root, r))));
  return roots.filter((_, i) => !present[i]);
}

export async function defaultName(root: string) {
  let raw = basename(root);
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      name?: unknown;
    };
    if (typeof pkg.name === 'string' && pkg.name.trim()) raw = pkg.name.replace(/^@[^/]+\//, '');
  } catch {
    // No readable package.json; the folder name is the default.
  }
  const name = raw
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
    .slice(0, 120);
  return name.length >= 2 ? name : 'My Harness';
}

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70)
    .replace(/-$/, '');

export const defaultDescription = (name: string, profiles: readonly Profile[]) =>
  'Native ' +
  profiles.map((p) => harnesses[p].label).join(', ') +
  ' configuration for ' +
  name +
  '.';

const nameProblem = (value: string) =>
  value.length < 2 || value.length > 120
    ? 'Use 2-120 characters.'
    : slugify(value).length < 3
      ? 'Use at least 3 letters or digits.'
      : null;
const descriptionProblem = (value: string) =>
  value.length < 10
    ? 'Use at least 10 characters.'
    : value.length > 600
      ? 'Use at most 600 characters.'
      : null;
const visibilityProblem = (value: string) =>
  visibilities.includes(value) ? null : 'Choose private, team, or public.';

async function field(
  label: string,
  given: string | undefined,
  fallback: string,
  problem: (value: string) => string | null,
  io: Prompter | null,
) {
  if (given !== undefined) {
    const issue = problem(given.trim());
    if (issue) throw new Error(label + ': ' + issue);
    return given.trim();
  }
  if (!io) {
    const issue = problem(fallback);
    if (issue) throw new Error(label + ': ' + issue);
    return fallback;
  }
  for (;;) {
    const value = (await io.ask(label, fallback)).trim();
    const issue = problem(value);
    if (!issue) return value;
    io.say(issue);
  }
}

export async function pickProfiles(root: string, io: Prompter): Promise<Profile[]> {
  const detected = await detectProfiles(root);
  const fallback = (detected.length ? detected : ['claude-code']).join(',');
  for (;;) {
    try {
      const chosen = parseProfiles([
        await io.ask('Runtime profiles (' + runtimeIds.join(', ') + ')', fallback),
      ]);
      if (chosen.length) return chosen;
    } catch (error) {
      io.say(error instanceof Error ? error.message : 'Choose a runtime profile.');
    }
  }
}

/** Resolve everything needed to create a Harness: flags win, then prompts (when `io`), then defaults. */
export async function planNewHarness(
  root: string,
  given: Given,
  io: Prompter | null,
  options: { requireFiles?: boolean } = {},
): Promise<NewHarness> {
  const detected = await detectProfiles(root);
  const name = await field('Name', given.name, await defaultName(root), nameProblem, io);
  let profiles = given.profiles?.length ? given.profiles : undefined;
  if (!profiles) {
    if (io) profiles = await pickProfiles(root, io);
    else if (detected.length) profiles = detected;
    else
      throw new Error(
        'No .claude, .gemini, or .github agent files found here. Pass -p <profile> (' +
          runtimeIds.join(', ') +
          ').',
      );
  }
  if (options.requireFiles) {
    const empty = await missingRoots(root, profiles);
    if (empty.length) {
      const message =
        'No ' + empty.join(', ') + ' folder in ' + root + '; the Harness would be empty.';
      if (!io) throw new Error(message + ' Add files first or choose another -p profile.');
      io.say(message);
      if (!/^y/i.test(await io.ask('Create it anyway? (y/N)', 'n'))) throw new Error('Cancelled.');
    }
  }
  const description = await field(
    'Description',
    given.description,
    defaultDescription(name, profiles),
    descriptionProblem,
    io,
  );
  const visibility = (await field(
    'Visibility (private, team, public)',
    given.visibility,
    'private',
    visibilityProblem,
    io,
  )) as Visibility;
  return { name, description, visibility, profiles };
}

export async function createRemoteHarness(
  client: Client,
  plan: NewHarness,
  io: Prompter | null,
): Promise<string> {
  let name = plan.name;
  for (let attempt = 0; ; attempt++) {
    try {
      const created = await client.call('/api/harnesses', 'POST', {
        name,
        slug: slugify(name),
        description: plan.description,
        visibility: plan.visibility,
        files: [],
      });
      return created.id as string;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || !io || attempt >= 3) throw error;
      io.say('A Harness named "' + name + '" already exists for your account.');
      name = await field('Name', undefined, name + ' 2', nameProblem, io);
    }
  }
}

export type HarnessChoice = { id: string; name: string; visibility?: string };

/** Numbered picker for `sks add` with no ID. Returns null to create a new Harness. */
export async function chooseHarness(
  items: HarnessChoice[],
  io: Prompter,
): Promise<HarnessChoice | null> {
  if (!items.length) return null;
  io.say('Your Harnesses:');
  items.forEach((item, i) =>
    io.say(
      '  ' + (i + 1) + ') ' + item.name + (item.visibility ? ' [' + item.visibility + ']' : ''),
    ),
  );
  io.say('  0) Create a new Harness');
  for (;;) {
    const answer = (await io.ask('Link which Harness?', '0')).trim();
    if (answer === '0') return null;
    const picked = items[Number(answer) - 1];
    if (picked) return picked;
    io.say('Enter a number from 0 to ' + items.length + '.');
  }
}
