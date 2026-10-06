import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { mkdir, readFile, unlink, chmod } from 'node:fs/promises';
import { promisify } from 'node:util';
import { userDir, atomicJSON, missing, type CredentialStorage } from './config.js';
import { loadKeyring } from './keyring.js';
const exec = promisify(execFile);
export const credentialFile = (key: string) => join(userDir(), 'credentials', key + '.json');
const keyringHelp =
  'OS keyring unavailable. In this workspace run npm install --include=optional, or explicitly use sks setup --storage file. On Windows you can use --storage dpapi.';

const protectionScript = String.raw`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Security
  $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $entropy = [Text.Encoding]::UTF8.GetBytes('SkillSync CLI:' + $payload.key)
  $scope = [Security.Cryptography.DataProtectionScope]::CurrentUser
  if ($payload.operation -eq 'protect') {
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload.value)
    $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, $scope)
    [Console]::Out.Write([Convert]::ToBase64String($result))
  } elseif ($payload.operation -eq 'unprotect') {
    $bytes = [Convert]::FromBase64String($payload.value)
    $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $entropy, $scope)
    [Console]::Out.Write([Text.Encoding]::UTF8.GetString($result))
  } else { exit 1 }
} catch { [Console]::Error.Write('Windows credential protection failed.'); exit 1 }
`;
export async function protectWindows(
  operation: 'protect' | 'unprotect',
  key: string,
  value: string,
): Promise<string> {
  if (process.platform !== 'win32') throw new Error('DPAPI storage is only available on Windows.');
  // Secrets go through stdin, never command arguments or environment variables.
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', protectionScript],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '',
      settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(output);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('Windows credential protection timed out.'));
    }, 15000);
    child.on('error', () => finish(new Error('Windows credential protection could not start.')));
    child.stdin.on('error', () => finish(new Error('Windows credential protection input failed.')));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.length > 64000) {
        child.kill();
        finish(new Error('Windows credential protection returned too much data.'));
      }
    });
    child.stderr.resume();
    child.on('close', (code) =>
      finish(
        code === 0 && output
          ? undefined
          : new Error(
              'Windows credential protection failed. Use --storage file explicitly if encrypted storage is unavailable.',
            ),
      ),
    );
    child.stdin.end(JSON.stringify({ operation, key, value }));
  });
}

async function protectedDirectory() {
  const directory = join(userDir(), 'credentials');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const who = await exec('whoami', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true });
    const sid = who.stdout.match(/S-1-[0-9-]+/)?.[0];
    if (!sid) throw new Error('Unable to determine credential owner SID.');
    await exec('icacls', [directory, '/inheritance:r', '/grant:r', '*' + sid + ':(OI)(CI)F'], {
      windowsHide: true,
    });
  } else await chmod(directory, 0o700);
}

async function probeKeyring() {
  const Entry = await loadKeyring();
  const entry = new Entry('SkillShare CLI', 'storage-probe-' + randomUUID(), {
    linux: { store: 'secret-service' },
  });
  const secret = randomUUID();
  try {
    entry.setPassword(secret);
    if (entry.getPassword() !== secret) throw new Error('Keyring did not retain the probe.');
  } finally {
    entry.deletePassword();
  }
}

export async function selectCredentialStorage(requested = 'auto'): Promise<CredentialStorage> {
  if (!['auto', 'keyring', 'dpapi', 'file'].includes(requested))
    throw new Error('Storage must be auto, keyring, dpapi, or file.');
  if (requested === 'auto' || requested === 'keyring') {
    try {
      await probeKeyring();
      return 'keyring';
    } catch {
      if (requested === 'keyring' || process.platform !== 'win32') throw new Error(keyringHelp);
    }
  }
  if (requested === 'dpapi' || requested === 'auto') {
    const secret = randomUUID(),
      key = 'storage-probe';
    const encrypted = await protectWindows('protect', key, secret);
    if ((await protectWindows('unprotect', key, encrypted)) !== secret)
      throw new Error('Windows credential protection round trip failed.');
    await protectedDirectory();
    return 'dpapi';
  }
  await protectedDirectory();
  return 'file';
}

export async function credentialStore(
  key: string,
  storage: CredentialStorage,
  value?: string,
  remove = false,
): Promise<string> {
  if (!['keyring', 'dpapi', 'file'].includes(storage))
    throw new Error('Unknown credential storage. Run setup again.');
  if (storage === 'keyring') {
    let Entry;
    try {
      Entry = await loadKeyring();
    } catch {
      throw new Error(keyringHelp);
    }
    const entry = new Entry('SkillShare CLI', key, { linux: { store: 'secret-service' } });
    if (remove) {
      entry.deletePassword();
      return '';
    }
    if (value !== undefined) {
      entry.setPassword(value);
      return value;
    }
    return entry.getPassword();
  }
  const file = credentialFile(key);
  if (remove) {
    await unlink(file).catch((error) => {
      if (!missing(error)) throw error;
    });
    return '';
  }
  if (value !== undefined) {
    const data =
      storage === 'dpapi'
        ? {
            schemaVersion: 1,
            storage: 'dpapi',
            ciphertext: await protectWindows('protect', key, value),
          }
        : { refreshToken: value };
    await protectedDirectory();
    await atomicJSON(file, data);
    await chmod(file, 0o600);
    return value;
  }
  const data = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  if (storage === 'dpapi') {
    if (data.schemaVersion !== 1 || data.storage !== 'dpapi' || typeof data.ciphertext !== 'string')
      throw new Error('Invalid encrypted credential. Run setup again.');
    return protectWindows('unprotect', key, data.ciphertext);
  }
  if (typeof data.refreshToken !== 'string')
    throw new Error('Invalid file credential. Run setup again.');
  return data.refreshToken;
}
