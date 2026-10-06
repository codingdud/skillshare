import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import {
  credentialFile,
  credentialStore,
  selectCredentialStorage,
  protectWindows,
} from './credentials.js';
import { loadKeyring } from './keyring.js';
import { login } from './auth.js';
vi.mock('./keyring.js', () => ({ loadKeyring: vi.fn() }));
let root: string, previous: string | undefined;
beforeEach(async () => {
  await mkdir(resolve('.local'), { recursive: true });
  root = await mkdtemp(resolve('.local/credential-test-'));
  previous = process.env.SKILLSHARE_CONFIG_DIR;
  process.env.SKILLSHARE_CONFIG_DIR = root;
  vi.mocked(loadKeyring).mockRejectedValue(new Error('Native dependency missing'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  if (previous === undefined) delete process.env.SKILLSHARE_CONFIG_DIR;
  else process.env.SKILLSHARE_CONFIG_DIR = previous;
  const rel = relative(resolve('.local'), root);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
    throw new Error('Unsafe credential fixture path');
  await rm(root, { recursive: true, force: true });
});
describe('credential storage readiness and protection', () => {
  it('detects an unavailable explicitly requested keyring before creating a grant or opening the browser', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    await expect(login('http://localhost:4000', { storage: 'keyring' })).rejects.toThrow(
      'npm install --include=optional',
    );
    expect(network).not.toHaveBeenCalled();
  });
  it('retains explicit file storage and rotation without requiring the native adapter', async () => {
    expect(await selectCredentialStorage('file')).toBe('file');
    await credentialStore('account', 'file', 'old-credential');
    await credentialStore('account', 'file', 'rotated-credential');
    expect(await credentialStore('account', 'file')).toBe('rotated-credential');
    expect(loadKeyring).not.toHaveBeenCalled();
    if (process.platform !== 'win32')
      expect((await stat(credentialFile('account'))).mode & 0o777).toBe(0o600);
    await credentialStore('account', 'file', undefined, true);
    await expect(readFile(credentialFile('account'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('keeps a working native keyring as the first automatic choice and removes its probe', async () => {
    const passwords = new Map<string, string>();
    class Entry {
      constructor(
        _service: string,
        private account: string,
      ) {}
      getPassword() {
        return passwords.get(this.account)!;
      }
      setPassword(value: string) {
        passwords.set(this.account, value);
      }
      deletePassword() {
        passwords.delete(this.account);
      }
    }
    vi.mocked(loadKeyring).mockResolvedValue(Entry);
    expect(await selectCredentialStorage()).toBe('keyring');
    expect(passwords.size).toBe(0);
    await credentialStore('account', 'keyring', 'test-credential');
    expect(await credentialStore('account', 'keyring')).toBe('test-credential');
  });
  it.skipIf(process.platform !== 'win32')(
    'automatically uses real Windows encryption when the native adapter is absent',
    async () => {
      expect(await selectCredentialStorage()).toBe('dpapi');
      await credentialStore('windows-account', 'dpapi', 'first-test-credential');
      const stored = await readFile(credentialFile('windows-account'), 'utf8');
      expect(stored).not.toContain('first-test-credential');
      expect(stored).not.toContain('refreshToken');
      expect(JSON.parse(stored).storage).toBe('dpapi');
      expect(await credentialStore('windows-account', 'dpapi')).toBe('first-test-credential');
      await credentialStore('windows-account', 'dpapi', 'rotated-test-credential');
      expect(await credentialStore('windows-account', 'dpapi')).toBe('rotated-test-credential');
      await credentialStore('windows-account', 'dpapi', undefined, true);
      await expect(readFile(credentialFile('windows-account'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );
  it.skipIf(process.platform !== 'win32')(
    'rejects the wrong credential binding and corrupt ciphertext without exposing contents',
    async () => {
      const encrypted = await protectWindows('protect', 'account-A', 'private-test-credential');
      await expect(protectWindows('unprotect', 'account-B', encrypted)).rejects.toThrow(
        'Windows credential protection failed',
      );
      await selectCredentialStorage('dpapi');
      await writeFile(
        credentialFile('account'),
        JSON.stringify({ schemaVersion: 1, storage: 'dpapi', ciphertext: 'corrupt' }),
      );
      await expect(credentialStore('account', 'dpapi')).rejects.toThrow(
        'Windows credential protection failed',
      );
    },
  );
  it.skipIf(process.platform === 'win32')(
    'does not silently select plaintext when the native keyring is absent',
    async () => {
      await expect(selectCredentialStorage()).rejects.toThrow('OS keyring unavailable');
    },
  );
});
