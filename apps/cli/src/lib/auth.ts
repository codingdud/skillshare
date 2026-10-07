import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { mkdir, open, unlink } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { userDir, settings, settingsFile, atomicJSON } from './config.js';

import { credentialStore, selectCredentialStorage } from './credentials.js';
const exec = promisify(execFile);
const accountKey = (server: string, userId: string) =>
  createHash('sha256')
    .update(server + ':' + userId)
    .digest('hex');
export async function browser(url: string) {
  // URL is validated by the caller; no shell command interpolation.
  if (process.platform === 'win32') {
    const quoted = url.replace(/'/g, "''");
    await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-Command',
        "Start-Process '" + quoted + "'",
      ],
      { windowsHide: true },
    );
  } else {
    const child = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {
      stdio: 'ignore',
      detached: true,
    });
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('spawn', resolve);
    });
    child.unref();
  }
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function requestJSON(
  server: string,
  path: string,
  method = 'GET',
  body?: unknown,
  token?: string,
) {
  const response = await fetch(server + path, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const data = (await response.json()) as any;
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.error?.code ?? 'HTTP_' + response.status,
      data.error?.message ?? 'Request failed.',
    );
  return data;
}
export async function login(
  server: string,
  options: { noBrowser?: boolean; storage?: string; readOnly?: boolean },
) {
  const storage = await selectCredentialStorage(options.storage);
  console.log(
    storage === 'file'
      ? 'Explicit file storage selected: refresh credentials are stored outside the repository with restricted permissions.'
      : storage === 'dpapi'
        ? 'Credential storage: Windows DPAPI (encrypted for your Windows account).'
        : 'Credential storage: OS keyring.',
  );
  const scope = options.readOnly ? 'harness:read' : 'harness:read harness:write harness:publish';
  const grant = await requestJSON(server, '/api/oauth/device/code', 'POST', {
    client_id: 'skillshare-cli',
    scope,
    label: 'SkillSync CLI',
  });
  const target = new URL(grant.verification_uri_complete);
  // Local development has separate browser/API ports. Remote destinations must use the trusted server host.
  const apiURL = new URL(server);
  const loopbacks = ['localhost', '127.0.0.1', '[::1]'];
  if (
    target.protocol !== apiURL.protocol ||
    (target.hostname !== apiURL.hostname &&
      !(loopbacks.includes(target.hostname) && loopbacks.includes(apiURL.hostname)))
  )
    throw new Error('Server returned an untrusted browser verification destination.');
  console.log('Open ' + target.href + '\nConfirm code: ' + grant.user_code);
  if (!options.noBrowser)
    await browser(target.href).catch(() =>
      console.log('Browser could not open. Open the URL above manually.'),
    );
  let interval = grant.interval as number;
  const expires = Date.now() + grant.expires_in * 1000;
  while (Date.now() < expires) {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    try {
      const result = await requestJSON(server, '/api/oauth/token', 'POST', {
        client_id: 'skillshare-cli',
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: grant.device_code,
      });
      const key = accountKey(server, result.user.id);
      try {
        await credentialStore(key, storage, result.refresh_token);
        const cfg = await settings();
        cfg.server = server;
        cfg.accounts ??= {};
        cfg.accounts[server] = { user: result.user, storage };
        await atomicJSON(settingsFile(), cfg);
      } catch (error) {
        await requestJSON(server, '/api/oauth/revoke', 'POST', {
          token: result.refresh_token,
        }).catch(() => undefined);
        throw new Error(
          'Could not persist credentials. Rerun setup with --storage dpapi on Windows or explicitly use --storage file. ' +
            (error as Error).message,
        );
      }
      console.log(
        'Authenticated as ' +
          result.user.name +
          ' (' +
          result.user.id +
          '). Credentials: ' +
          storage,
      );
      return;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'authorization_pending') continue;
      if (error instanceof ApiError && error.code === 'slow_down') {
        interval += 5;
        continue;
      }
      throw error;
    }
  }
  throw new Error('Authorization expired. Run setup again.');
}
export class Client {
  private access?: string;
  private pending?: Promise<void>;
  constructor(public server: string) {}
  async refresh() {
    if (this.pending) return this.pending;
    this.pending = this.refreshLocked().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async refreshLocked() {
    const cfg = await settings(),
      account = cfg.accounts?.[this.server];
    if (!account) throw new Error('Run setup --server ' + this.server + ' to authenticate.');
    const key = accountKey(this.server, account.user.id);
    await mkdir(userDir(), { recursive: true, mode: 0o700 });
    const lock = join(userDir(), key + '.lock');
    let handle;
    for (let i = 0; i < 100; i++) {
      try {
        handle = await open(lock, 'wx', 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!handle)
      throw new Error(
        'Credential lock busy. If a previous CLI crashed, remove ' +
          lock +
          ' after checking no command is running.',
      );
    try {
      const refresh = await credentialStore(key, account.storage);
      const result = await requestJSON(this.server, '/api/oauth/token', 'POST', {
        client_id: 'skillshare-cli',
        grant_type: 'refresh_token',
        refresh_token: refresh,
      });
      await credentialStore(key, account.storage, result.refresh_token);
      this.access = result.access_token;
    } finally {
      await handle.close();
      await unlink(lock);
    }
  }
  async call(path: string, method = 'GET', body?: unknown) {
    if (!this.access) await this.refresh();
    try {
      return await requestJSON(this.server, path, method, body, this.access);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      await this.refresh();
      return requestJSON(this.server, path, method, body, this.access);
    }
  }
}
export async function logout(server: string) {
  const cfg = await settings(),
    account = cfg.accounts?.[server];
  if (!account) return;
  const key = accountKey(server, account.user.id);
  try {
    await requestJSON(server, '/api/oauth/revoke', 'POST', {
      token: await credentialStore(key, account.storage),
    });
  } catch {
    console.log(
      'Server revocation could not be confirmed. Revoke this session from Connected devices.',
    );
  }
  await credentialStore(key, account.storage, undefined, true);
  delete cfg.accounts![server];
  await atomicJSON(settingsFile(), cfg);
  console.log('Local credential removed.');
}
