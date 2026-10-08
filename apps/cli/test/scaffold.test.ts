import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseProfiles,
  detectProfiles,
  defaultName,
  slugify,
  planNewHarness,
  createRemoteHarness,
  chooseHarness,
} from '../src/lib/scaffold.js';
import { ApiError, type Client } from '../src/lib/auth.js';
import type { Prompter } from '../src/lib/prompt.js';

function scripted(answers: string[]) {
  const said: string[] = [];
  const asked: string[] = [];
  const io: Prompter = {
    async ask(question, fallback) {
      asked.push(question);
      const next = answers.shift();
      return next?.trim() || fallback || '';
    },
    say: (message) => said.push(message),
  };
  return { io, said, asked };
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sks-scaffold-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('profile parsing', () => {
  it('accepts aliases, repeated flags, and comma lists without duplicates', () => {
    expect(parseProfiles(['claude', 'gemini-cli,claude-code'])).toEqual([
      'claude-code',
      'gemini-cli',
    ]);
    expect(parseProfiles(['copilot'])).toEqual(['copilot-vscode']);
    expect(parseProfiles(undefined)).toEqual([]);
  });
  it('rejects unknown profiles with the supported list', () => {
    expect(() => parseProfiles(['cursor'])).toThrow(
      /Unknown runtime profile "cursor".*claude-code/,
    );
  });
});

describe('detection and defaults', () => {
  it('detects agent folders but ignores a bare .github with only workflows', async () => {
    await mkdir(join(root, '.github', 'workflows'), { recursive: true });
    expect(await detectProfiles(root)).toEqual([]);
    await mkdir(join(root, '.claude'));
    await mkdir(join(root, '.gemini'));
    await mkdir(join(root, '.github', 'agents'));
    expect(await detectProfiles(root)).toEqual(['claude-code', 'gemini-cli', 'copilot-vscode']);
  });
  it('names the Harness from package.json, then the folder', async () => {
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@acme/review-toolkit' }));
    expect(await defaultName(root)).toBe('Review Toolkit');
    await rm(join(root, 'package.json'));
    expect(await defaultName(root)).toMatch(/^Sks Scaffold/);
  });
  it('builds a valid slug', () => {
    expect(slugify('  My Toolkit! v2 ')).toBe('my-toolkit-v2');
  });
});

describe('planNewHarness', () => {
  it('uses detected profiles and private defaults without prompting', async () => {
    await mkdir(join(root, '.claude'));
    const plan = await planNewHarness(root, { name: 'Review Kit' }, null);
    expect(plan).toMatchObject({
      name: 'Review Kit',
      visibility: 'private',
      profiles: ['claude-code'],
    });
    expect(plan.description.length).toBeGreaterThanOrEqual(10);
  });
  it('requires -p when nothing is detected and nothing can be asked', async () => {
    await expect(planNewHarness(root, {}, null)).rejects.toThrow(/Pass -p/);
  });
  it('accepts defaults on Enter and re-asks invalid answers', async () => {
    await mkdir(join(root, '.gemini'));
    const { io, said } = scripted([
      'x',
      'Gemini Kit',
      '',
      'short',
      'A longer description here',
      'secret',
      'public',
    ]);
    const plan = await planNewHarness(root, {}, io);
    expect(plan).toEqual({
      name: 'Gemini Kit',
      description: 'A longer description here',
      visibility: 'public',
      profiles: ['gemini-cli'],
    });
    expect(said).toEqual([
      'Use 2-120 characters.',
      'Use at least 10 characters.',
      'Choose private, team, or public.',
    ]);
  });
  it('flags win over prompts and are validated', async () => {
    const { io, asked } = scripted([]);
    const plan = await planNewHarness(
      root,
      {
        name: 'Flag Kit',
        description: 'Described by a flag',
        visibility: 'team',
        profiles: ['claude-code'],
      },
      io,
    );
    expect(plan.visibility).toBe('team');
    expect(asked).toEqual([]);
    await expect(
      planNewHarness(
        root,
        { name: 'Flag Kit', visibility: 'world', profiles: ['claude-code'] },
        null,
      ),
    ).rejects.toThrow(/Choose private, team, or public/);
  });
  it('refuses to create an empty Harness unless the user confirms', async () => {
    const given = { name: 'Empty Kit', profiles: ['claude-code' as const] };
    await expect(planNewHarness(root, given, null, { requireFiles: true })).rejects.toThrow(
      /would be empty/,
    );
    await expect(
      planNewHarness(root, given, scripted(['n']).io, { requireFiles: true }),
    ).rejects.toThrow(/Cancelled/);
    const yes = await planNewHarness(root, given, scripted(['y']).io, { requireFiles: true });
    expect(yes.profiles).toEqual(['claude-code']);
  });
});

describe('createRemoteHarness', () => {
  const plan = {
    name: 'Kit',
    description: 'A kit for tests',
    visibility: 'private' as const,
    profiles: ['claude-code' as const],
  };
  it('posts an empty private Harness with a derived slug', async () => {
    const calls: any[] = [];
    const client = {
      call: async (...args: any[]) => (calls.push(args), { id: 'abc' }),
    } as unknown as Client;
    expect(await createRemoteHarness(client, plan, null)).toBe('abc');
    expect(calls[0]).toEqual([
      '/api/harnesses',
      'POST',
      {
        name: 'Kit',
        slug: 'kit',
        description: 'A kit for tests',
        visibility: 'private',
        files: [],
      },
    ]);
  });
  it('asks for another name after a conflict when interactive', async () => {
    const names: string[] = [];
    const client = {
      call: async (_p: string, _m: string, body: any) => {
        names.push(body.name);
        if (body.name === 'Kit') throw new ApiError(409, 'CONFLICT', 'exists');
        return { id: 'new' };
      },
    } as unknown as Client;
    const { io } = scripted(['Kit Two']);
    expect(await createRemoteHarness(client, plan, io)).toBe('new');
    expect(names).toEqual(['Kit', 'Kit Two']);
  });
  it('surfaces a conflict when it cannot ask', async () => {
    const client = {
      call: async () => {
        throw new ApiError(409, 'CONFLICT', 'exists');
      },
    } as unknown as Client;
    await expect(createRemoteHarness(client, plan, null)).rejects.toThrow('exists');
  });
});

describe('chooseHarness', () => {
  const items = [
    { id: 'a', name: 'Alpha', visibility: 'private' },
    { id: 'b', name: 'Beta' },
  ];
  it('returns the numbered pick, or null to create a new one', async () => {
    expect((await chooseHarness(items, scripted(['2']).io))?.id).toBe('b');
    expect(await chooseHarness(items, scripted(['0']).io)).toBeNull();
    expect(await chooseHarness([], scripted([]).io)).toBeNull();
  });
  it('re-asks out-of-range answers', async () => {
    const { io, said } = scripted(['9', '1']);
    expect((await chooseHarness(items, io))?.id).toBe('a');
    expect(said.at(-1)).toBe('Enter a number from 0 to 2.');
  });
});
