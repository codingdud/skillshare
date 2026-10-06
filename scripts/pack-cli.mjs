import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run npm run cli:pack from the workspace root.');
await mkdir('.local', { recursive: true });
const result = spawnSync(
  process.execPath,
  [npm, 'pack', '--workspace', '@skillsync/cli', '--pack-destination', '.local'],
  { stdio: 'inherit', windowsHide: true },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
