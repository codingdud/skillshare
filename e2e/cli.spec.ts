import { promisify } from 'node:util';
import { test, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const cli = resolve('apps/cli/dist/bin.js'),
  node =
    process.platform === 'win32' ? resolve('node_modules/node/bin/node.exe') : process.execPath;
test('browser CLI authorization and local push/pull preserve versions, conflicts, and native folders', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  await mkdir(resolve('.local'), { recursive: true });
  const root = await mkdtemp(resolve('.local/cli-e2e-')),
    producer = join(root, 'producer'),
    consumer = join(root, 'consumer'),
    auth = join(root, 'account');
  await mkdir(producer, { recursive: true });
  await mkdir(consumer, { recursive: true });
  const token = (
    await (
      await request.post('http://localhost:4000/api/auth/login', {
        headers: { Origin: 'http://localhost:5173' },
        data: { email: 'demo@skillshare.test', password: 'SkillShare-Demo-2026!' },
      })
    ).json()
  ).accessToken;
  const headers = { Origin: 'http://localhost:5173', Authorization: 'Bearer ' + token };
  const previous = (
    await (await request.get('http://localhost:4000/api/auth/devices', { headers })).json()
  ).items.map((d: { id: string }) => d.id);
  function launch(cwd: string, args: string[]) {
    const child = spawn(node, [cli, ...args], {
      cwd,
      env: { ...process.env, SKILLSHARE_CONFIG_DIR: auth },
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    const finished = new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, output }));
    });
    return { child, finished, output: () => output };
  }
  async function run(cwd: string, args: string[], expected = 0) {
    const result = await launch(cwd, args).finished;
    expect(result.code, result.output).toBe(expected);
    return result;
  }
  const setup = launch(producer, [
    'setup',
    '--server',
    'http://localhost:4000',
    '--storage',
    process.platform === 'win32' ? 'dpapi' : 'file',
    '--no-browser',
  ]);
  await expect
    .poll(() => setup.output().match(/Confirm code: ([A-Z2-9]{4}-[A-Z2-9]{4})/)?.[1])
    .toBeTruthy();
  const code = setup.output().match(/Confirm code: ([A-Z2-9]{4}-[A-Z2-9]{4})/)![1]!;
  await page.goto('/device?code=' + code);
  await page.getByRole('link', { name: 'Sign in to authorize CLI' }).click();
  await page.getByLabel('Email address').fill('demo@skillshare.test');
  await page.getByLabel('Password', { exact: true }).fill('SkillShare-Demo-2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/device\?code=/);
  await page.getByRole('checkbox', { name: /matches my terminal/ }).check();
  await page.getByRole('button', { name: 'Authorize CLI', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('CLI authorized');
  expect((await setup.finished).code, setup.output()).toBe(0);
  const storedAccount = JSON.parse(await readFile(join(auth, 'settings.json'), 'utf8'));
  expect(storedAccount.accounts['http://localhost:4000'].storage).toBe(
    process.platform === 'win32' ? 'dpapi' : 'file',
  );
  const device = (
    await (await request.get('http://localhost:4000/api/auth/devices', { headers })).json()
  ).items.find((d: { id: string }) => !previous.includes(d.id));
  const created = await request.post('http://localhost:4000/api/harnesses', {
    headers,
    data: {
      name: 'CLI browser ' + Date.now(),
      slug: 'cli-browser-' + Date.now(),
      description: 'Native CLI round trip and browser approval fixture.',
      visibility: 'private',
      files: [{ path: 'README.md', content: 'Preserve documentation' }],
    },
  });
  expect(created.ok()).toBe(true);
  const id = (await created.json()).id;
  await mkdir(join(producer, '.claude/agents'), { recursive: true });
  await mkdir(join(producer, '.gemini'), { recursive: true });
  await mkdir(join(producer, '.github/copilot'), { recursive: true });
  const path = '.claude/agents/reviewer.md';
  await writeFile(join(producer, path), 'Review baseline.\n');
  await writeFile(
    join(producer, '.gemini/settings.json'),
    '{"general":{"vimMode":false},"mcpServers":{"review":{"httpUrl":"https://example.com/mcp"}}}\n',
  );
  await writeFile(join(producer, '.github/copilot/settings.json'), '{"disableAllHooks":false}\n');
  await run(producer, [
    'add',
    id,
    '--link-only',
    '--profile',
    'claude-code',
    '--profile',
    'gemini-cli',
    '--profile',
    'copilot-cli',
  ]);
  await run(producer, ['push', '--dry-run']);
  await run(producer, ['push', '-m', 'Initial native folders']);
  const endpoint = 'http://localhost:4000/api/harnesses/' + id;
  async function webEdit(content: string) {
    const current = await (await request.get(endpoint, { headers })).json();
    const files = current.files.map((f: { path: string; content: string }) =>
      f.path === path ? { ...f, content } : f,
    );
    const saved = await request.put(endpoint + '/files', {
      headers,
      data: { revision: current.revision, files },
    });
    expect(saved.ok()).toBe(true);
    return saved.json();
  }
  await webEdit('Review updated in browser.\n');
  await run(producer, ['pull', '--draft', '--dry-run']);
  expect(await readFile(join(producer, path), 'utf8')).toBe('Review baseline.\n');
  await run(producer, ['pull', '--draft', '--yes']);
  expect(await readFile(join(producer, path), 'utf8')).toBe('Review updated in browser.\n');
  await run(producer, ['publish', '1.0.0', '--notes', 'Native initial release', '--yes']);
  // Real Git clone/worktree checks: machine-local state is absent but comparisons still work.
  const git = promisify(execFile),
    cloned = join(root, 'cloned'),
    worktree = join(root, 'worktree');
  await git('git', ['init', producer], { windowsHide: true });
  await git('git', ['-C', producer, 'config', 'user.name', 'Sync test'], { windowsHide: true });
  await git('git', ['-C', producer, 'config', 'user.email', 'sync-test@skillshare.test'], {
    windowsHide: true,
  });
  await git('git', ['-C', producer, 'config', 'core.autocrlf', 'false'], { windowsHide: true });
  const noHooks = join(root, 'no-hooks');
  await mkdir(noHooks);
  await git('git', ['-C', producer, 'config', 'core.hooksPath', noHooks], { windowsHide: true });
  await git('git', ['-C', producer, 'add', '--all'], { windowsHide: true });
  await git(
    'git',
    [
      '-C',
      producer,
      '-c',
      'user.name=Sync test',
      '-c',
      'user.email=sync-test@skillshare.test',
      'commit',
      '-m',
      'Native snapshot and tracked baseline',
    ],
    { windowsHide: true },
  );
  await git(
    'git',
    [
      '-c',
      'core.autocrlf=false',
      '-c',
      'core.hooksPath=' + noHooks,
      'clone',
      '--no-local',
      producer,
      cloned,
    ],
    { windowsHide: true },
  );
  expect(await lstat(join(cloned, '.skillshare/local/state.json')).catch(() => null)).toBeNull();
  await run(cloned, ['status']);
  await writeFile(join(cloned, path), 'Local clone variant.\n');
  await run(cloned, ['pull', '--yes']);
  expect(await readFile(join(cloned, path), 'utf8')).toBe('Local clone variant.\n');
  expect(JSON.parse(await readFile(join(cloned, '.skillshare/lock.json'), 'utf8')).diverged).toBe(
    true,
  );
  await git('git', ['-C', producer, 'worktree', 'add', '--detach', worktree], {
    windowsHide: true,
  });
  expect(await lstat(join(worktree, '.skillshare/local/state.json')).catch(() => null)).toBeNull();
  await run(worktree, ['status']);

  await mkdir(join(consumer, '.github/workflows'), { recursive: true });
  await writeFile(join(consumer, '.github/workflows/build.yml'), 'Preserve my workflow');
  await run(consumer, ['add', id, '--profile', 'claude-code', '--profile', 'gemini-cli', '--yes']);
  expect(await readFile(join(consumer, path), 'utf8')).toBe('Review updated in browser.\n');
  expect(await readFile(join(consumer, '.github/workflows/build.yml'), 'utf8')).toBe(
    'Preserve my workflow',
  );
  const newer = await webEdit('Release two output.\n');
  await request
    .post(endpoint + '/releases', {
      headers,
      data: { revision: newer.revision, version: '1.1.0', notes: 'New review output' },
    })
    .then((r) => expect(r.ok()).toBe(true));
  await run(consumer, ['pull', '--yes']);
  expect(await readFile(join(consumer, path), 'utf8')).toBe('Review updated in browser.\n');
  await run(consumer, ['pull', '--version', '1.1.0', '--yes']);
  expect(await readFile(join(consumer, path), 'utf8')).toBe('Release two output.\n');
  await writeFile(join(consumer, path), 'Keep my local edit.\n');
  const latest = await webEdit('Conflicting release.\n');
  await request.post(endpoint + '/releases', {
    headers,
    data: { revision: latest.revision, version: '1.2.0', notes: 'Another review output' },
  });
  const conflict = await run(consumer, ['pull', '--version', '1.2.0', '--yes'], 1);
  expect(conflict.output).toContain('CONFLICT');
  expect(await readFile(join(consumer, path), 'utf8')).toBe('Keep my local edit.\n');
  await run(consumer, ['resolve', path, '--keep', 'local', '--version', '1.2.0', '--yes']);
  await run(consumer, ['pull', '--version', '1.2.0', '--yes']);
  expect(await readFile(join(consumer, path), 'utf8')).toBe('Keep my local edit.\n');
  for (let index = 0; index < 52; index++) await webEdit('History pagination ' + index + '.\n');
  await page.goto('/harnesses/' + id + '/history');
  await expect(page.getByRole('heading', { name: 'Harness history' })).toBeVisible();
  await page.getByRole('button', { name: 'Load older revisions' }).click();
  await expect(
    page.locator('.panel').filter({ hasText: 'Initial native folders' }).last(),
  ).toBeVisible();
  const exported = await run(producer, [
    'git',
    'export',
    '--version',
    '1.2.0',
    '--branch',
    'skillsync/e2e-release',
    '--dry-run',
  ]);
  expect(exported.output).toContain('exact release binding');
  await run(producer, [
    'git',
    'export',
    '--version',
    '1.2.0',
    '--branch',
    'skillsync/e2e-release',
    '--yes',
  ]);
  const imported = await run(producer, [
    'git',
    'import',
    '--ref',
    'skillsync/e2e-release',
    '--dry-run',
  ]);
  expect(imported.output).toContain('proposal based on Harness revision');
  await run(producer, [
    'git',
    'import',
    '--ref',
    'skillsync/e2e-release',
    '--yes',
    '-m',
    'Git bridge release contribution',
  ]);
  const proposals = (await (await request.get(endpoint + '/proposals', { headers })).json()).items;
  const proposal = proposals.find(
    (p: { title: string }) => p.title === 'Git bridge release contribution',
  );
  expect(proposal.source.commit).toMatch(/^[a-f0-9]{40}$/);
  expect(
    (
      await (await request.get(endpoint + '/proposals/' + proposal.id, { headers })).json()
    ).files.find((f: { path: string }) => f.path === path).content,
  ).toBe('Conflicting release.\n');
  await page.goto('/devices');
  await expect(page.getByRole('heading', { name: 'Connected devices' })).toBeVisible();
  await request
    .delete('http://localhost:4000/api/auth/devices/' + device.id, { headers })
    .then((r) => expect(r.ok()).toBe(true));
  await run(producer, ['auth', 'status'], 1);
  // Only fixture IDs are recorded for cleanup; no broad database deletion is performed by the test.
  await writeFile(
    join(root, 'fixture.json'),
    JSON.stringify({ harnessId: id, deviceId: device.id }),
  );
});
