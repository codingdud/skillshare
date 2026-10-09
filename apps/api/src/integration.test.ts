import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import request from 'supertest';
import { addHarnessTemplate, harnessJSONLimit } from '@skillshare/contracts';
import { unzipSync, strFromU8 } from 'fflate';
import { randomUUID } from 'node:crypto';
import { SignJWT, decodeJwt } from 'jose';
import { config } from './config.js';
const state = vi.hoisted(() => ({
  db: null as unknown as PGlite,
  queue: Promise.resolve() as Promise<unknown>,
  outbox: [] as { email: string; code: string; purpose: string }[],
}));
vi.mock('./modules/auth/mail.service.js', () => ({
  mailService: {
    sendOtp: async (email: string, code: string, purpose: string) => {
      state.outbox.push({ email, code, purpose });
    },
    verifyConnection: async () => undefined,
  },
}));
vi.mock('./db/client.js', () => {
  const query = async (sql: string, params: unknown[] = []) => {
    const result = await state.db.query(sql, params);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  };
  return {
    pool: { query },
    transaction: <T>(work: (db: { query: typeof query }) => Promise<T>) => {
      const result = state.queue.then(() =>
        state.db.transaction(async (tx) =>
          work({
            query: async (sql, params = []) => {
              const result = await tx.query(sql, params);
              return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
            },
          }),
        ),
      );
      state.queue = result.catch(() => undefined);
      return result;
    },
  };
});
import { app, apiRequestLimit } from './app.js';
import { treeHash } from './modules/harnesses/harness.sync.js';
import { backfillSyncIntegrity } from './db/sync-integrity.js';
import { pool } from './db/client.js';
const origin = 'http://localhost:5173';
async function cliLogin(token: string, scope = 'harness:read harness:write harness:publish') {
  const grant = (
    await request(app).post('/api/oauth/device/code').send({ client_id: 'skillshare-cli', scope })
  ).body;
  await post('/auth/device-decision', token)
    .send({ code: grant.user_code, approve: true })
    .expect(204);
  const exchanged = await request(app)
    .post('/api/oauth/token')
    .send({
      client_id: 'skillshare-cli',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: grant.device_code,
    })
    .expect(200);
  return { grant, tokens: exchanged.body };
}
let ownerToken: string, otherToken: string, ownerId: string;
const post = (path: string, token?: string) => {
  const req = request(app).post(`/api${path}`).set('Origin', origin);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const get = (path: string, token?: string) => {
  const req = request(app).get(`/api${path}`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(await readFile(new URL('./db/schema.sql', import.meta.url), 'utf8'));
  await state.db.exec(
    await readFile(
      new URL('./db/migrations/004-harness-repositories.sql', import.meta.url),
      'utf8',
    ),
  );
  await state.db.exec(
    await readFile(new URL('./db/migrations/005-harness-members.sql', import.meta.url), 'utf8'),
  );
  await state.db.exec(
    await readFile(new URL('./db/migrations/007-cli-sync.sql', import.meta.url), 'utf8'),
  );
  await state.db.exec(
    await readFile(new URL('./db/migrations/008-user-profiles.sql', import.meta.url), 'utf8'),
  );
  await state.db.exec(
    await readFile(new URL('./db/migrations/009-admin-roles.sql', import.meta.url), 'utf8'),
  );
  await state.db.exec(
    await readFile(new URL('./db/migrations/010-sync-integrity.sql', import.meta.url), 'utf8'),
  );
  await state.db.exec(
    await readFile(
      new URL('./db/migrations/011-harness-collaboration.sql', import.meta.url),
      'utf8',
    ),
  );
  await state.db.exec(
    await readFile(new URL('./db/migrations/012-harness-ratings.sql', import.meta.url), 'utf8'),
  );
  const owner = await post('/auth/register')
    .send({ name: 'Owner', email: 'owner@example.com', password: 'long-and-unique-password' })
    .expect(201);
  expect(owner.body.requiresVerification).toBe(true);
  const ownerCode = state.outbox.find(
    (message) => message.email === 'owner@example.com' && message.purpose === 'verify_email',
  )!.code;
  const verifiedOwner = await post('/auth/verify-email')
    .send({ email: 'owner@example.com', code: ownerCode })
    .expect(200);
  ownerToken = verifiedOwner.body.accessToken;
  ownerId = verifiedOwner.body.user.id;
  const other = await post('/auth/register')
    .send({ name: 'Other', email: 'other@example.com', password: 'another-long-password' })
    .expect(201);
  const otherCode = state.outbox.find(
    (message) => message.email === 'other@example.com' && message.purpose === 'verify_email',
  )!.code;
  otherToken = (
    await post('/auth/verify-email')
      .send({ email: 'other@example.com', code: otherCode })
      .expect(200)
  ).body.accessToken;
  await state.db.exec(
    await readFile(new URL('./db/migrations/006-harness-only.sql', import.meta.url), 'utf8'),
  );
});
afterAll(async () => {
  await state.db.close();
});
describe('authentication and origin protection', () => {
  it('authorizes CLI independently, preserves Origin protection, rotates refresh credentials, and revokes devices', async () => {
    const login = await post('/auth/login')
      .send({ email: 'owner@example.com', password: 'long-and-unique-password' })
      .expect(200);
    const token = login.body.accessToken;
    const { grant, tokens } = await cliLogin(token);
    await request(app)
      .post('/api/oauth/token')
      .send({
        client_id: 'skillshare-cli',
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: grant.device_code,
      })
      .expect(400);
    await request(app)
      .post('/api/harnesses')
      .set('Authorization', 'Bearer ' + token)
      .send({})
      .expect(403);
    const created = await request(app)
      .post('/api/harnesses')
      .set('Authorization', 'Bearer ' + tokens.access_token)
      .send({
        name: 'CLI authorization fixture',
        slug: 'cli-auth-fixture',
        description: 'Native configuration synchronized through CLI.',
        visibility: 'private',
        files: [{ path: 'README.md', content: 'Keep remote documentation' }],
      })
      .expect(201);
    const id = created.body.id;
    const payload = {
      revision: 1,
      requestId: randomUUID(),
      message: 'Add native review agent',
      profiles: ['claude-code'],
      upsert: [{ path: '.claude/agents/reviewer.md', content: 'Review code.' }],
      remove: [],
    };
    const pushed = await request(app)
      .post('/api/harnesses/' + id + '/changesets')
      .set('Authorization', 'Bearer ' + tokens.access_token)
      .send(payload)
      .expect(200);
    expect(pushed.body.revision).toBe(2);
    expect(pushed.body.files.some((f: { path: string }) => f.path === 'README.md')).toBe(true);
    const replay = await request(app)
      .post('/api/harnesses/' + id + '/changesets')
      .set('Authorization', 'Bearer ' + tokens.access_token)
      .send(payload)
      .expect(200);
    expect(replay.body.revision).toBe(2);
    await request(app)
      .post('/api/harnesses/' + id + '/changesets')
      .set('Authorization', 'Bearer ' + tokens.access_token)
      .send({ ...payload, message: 'Different request' })
      .expect(409);
    await request(app)
      .post('/api/harnesses/' + id + '/changesets')
      .set('Authorization', 'Bearer ' + tokens.access_token)
      .send({ ...payload, requestId: randomUUID() })
      .expect(409);
    const history = await get('/harnesses/' + id + '/revisions', token).expect(200);
    expect(history.body.items.map((r: { source: string }) => r.source)).toEqual(['cli', 'web']);
    await get('/harnesses/' + id + '/revisions').expect(401);
    await get('/harnesses/' + id + '/revisions', otherToken).expect(404);
    await request(app)
      .post('/api/harnesses/' + id + '/changesets')
      .set('Authorization', 'Bearer ' + tokens.access_token)
      .send({
        ...payload,
        revision: 2,
        requestId: randomUUID(),
        upsert: [{ path: '.github/workflows/build.yml', content: 'unrelated' }],
      })
      .expect(422);
    const published = await request(app)
      .post('/api/harnesses/' + id + '/releases')
      .set('Authorization', 'Bearer ' + tokens.access_token)
      .send({ revision: 2, version: '1.0.0', notes: 'CLI native release' })
      .expect(201);
    const snapshot = await get(
      '/harnesses/' + id + '/manifest?ref=' + published.body.id,
      tokens.access_token,
    ).expect(200);
    expect(snapshot.body.treeHash).toHaveLength(64);
    const oldRevision = history.body.items[1].id;
    const restored = await post('/harnesses/' + id + '/restore', token)
      .send({ revisionId: oldRevision, revision: 2 })
      .expect(200);
    expect(restored.body.revision).toBe(3);
    expect(restored.body.files.map((f: { path: string }) => f.path)).toEqual(['README.md']);
    await post('/harnesses/' + id + '/restore', token)
      .send({ revisionId: oldRevision, revision: 2 })
      .expect(409);
    const stable = await get(
      '/harnesses/' + id + '/manifest?ref=' + published.body.id,
      token,
    ).expect(200);
    expect(stable.body.treeHash).toBe(snapshot.body.treeHash);
    const readOnly = await cliLogin(token, 'harness:read');
    await request(app)
      .put('/api/harnesses/' + id + '/files')
      .set('Authorization', 'Bearer ' + readOnly.tokens.access_token)
      .send({ revision: 2, files: [] })
      .expect(403);
    const refreshed = await request(app)
      .post('/api/oauth/token')
      .send({
        client_id: 'skillshare-cli',
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      })
      .expect(200);
    expect(refreshed.body.refresh_token).not.toBe(tokens.refresh_token);
    await post('/auth/refresh')
      .set('Cookie', 'skillshare_refresh=' + refreshed.body.refresh_token)
      .expect(401);
    const devices = (await get('/auth/devices', token).expect(200)).body.items;
    const sessionId = devices.find((d: { scopes: string[] }) =>
      d.scopes.includes('harness:write'),
    ).id;
    await request(app)
      .delete('/api/auth/devices/' + sessionId)
      .set('Origin', origin)
      .set('Authorization', 'Bearer ' + token)
      .expect(204);
    await get('/harnesses/' + id, refreshed.body.access_token).expect(401);
    await request(app)
      .post('/api/oauth/token')
      .send({
        client_id: 'skillshare-cli',
        grant_type: 'refresh_token',
        refresh_token: refreshed.body.refresh_token,
      })
      .expect(401);
  });
  it('handles pending, backoff, denial, expiration, and approved-code reuse', async () => {
    const grant = (
      await request(app)
        .post('/api/oauth/device/code')
        .send({ client_id: 'skillshare-cli' })
        .expect(200)
    ).body;
    const exchange = () =>
      request(app).post('/api/oauth/token').send({
        client_id: 'skillshare-cli',
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: grant.device_code,
      });
    expect((await exchange().expect(400)).body.error.code).toBe('authorization_pending');
    expect((await exchange().expect(400)).body.error.code).toBe('slow_down');
    await post('/auth/device-decision', ownerToken)
      .send({ code: grant.user_code, approve: false })
      .expect(204);
    expect((await exchange().expect(400)).body.error.code).toBe('access_denied');
    await state.db.exec("UPDATE device_authorizations SET expires_at=now()-interval '1 second'");
    expect((await exchange().expect(400)).body.error.code).toBe('expired_token');
  });
  it('restores anonymous sessions quietly without allowing unauthenticated refreshes', async () => {
    const anonymous = await post('/auth/session').expect(200);
    expect(anonymous.body).toBeNull();
    const expired = await post('/auth/session')
      .set('Cookie', 'skillshare_refresh=expired')
      .expect(200);
    expect(expired.body).toBeNull();
    expect(expired.headers['set-cookie'][0]).toContain('Expires=Thu, 01 Jan 1970');
    await post('/auth/refresh').expect(401);
    await request(app).post('/api/auth/session').set('Origin', 'https://evil.example').expect(403);
  });
  it('restores existing sessions by rotating the cookie and preserving replay protection', async () => {
    const login = await post('/auth/login')
      .send({ email: 'owner@example.com', password: 'long-and-unique-password' })
      .expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const restored = await post('/auth/session').set('Cookie', cookie).expect(200);
    expect(restored.body.user.id).toBe(ownerId);
    const rotated = restored.headers['set-cookie'][0].split(';')[0];
    expect(rotated).not.toBe(cookie);
    await get('/auth/me', restored.body.accessToken).expect(200);
    const replay = await post('/auth/session').set('Cookie', cookie).expect(200);
    expect(replay.body).toBeNull();
    await post('/auth/refresh').set('Cookie', rotated).expect(401);
  });
  it('rotates refresh cookies and revokes the family on replay', async () => {
    const login = await post('/auth/login')
      .send({ email: 'owner@example.com', password: 'long-and-unique-password' })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    const refresh = await post('/auth/refresh').set('Cookie', cookie).expect(200);
    const newCookie = (refresh.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(newCookie).not.toBe(cookie);
    await post('/auth/refresh').set('Cookie', cookie).expect(401);
    await post('/auth/refresh').set('Cookie', newCookie).expect(401);
    await get('/auth/me', refresh.body.accessToken).expect(401);
  });
  it('revokes access immediately on logout', async () => {
    const login = await post('/auth/login')
      .send({ email: 'owner@example.com', password: 'long-and-unique-password' })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    await post('/auth/logout').set('Cookie', cookie).expect(204);
    await get('/auth/me', login.body.accessToken).expect(401);
  });
  it('rejects cross-origin cookie mutations and malformed data', async () => {
    await request(app).post('/api/auth/refresh').set('Origin', 'https://evil.example').expect(403);
    await post('/auth/register').send({ name: 'a', email: 'bad', password: 'short' }).expect(422);
    await get('/harnesses/not-a-uuid').expect(422);
  });
});
describe('Harness repository releases and access', () => {
  it('removes standalone asset, project, and community endpoints', async () => {
    for (const path of [
      '/assets',
      '/assets/11111111-1111-4111-8111-111111111111',
      '/projects',
      '/workspace/assets',
      '/assets/11111111-1111-4111-8111-111111111111/proposals',
    ]) {
      await get(path, ownerToken).expect(404);
      await post(path, ownerToken).send({}).expect(404);
    }
    const schema = await state.db.query(
      "SELECT to_regclass('public.assets') AS active,to_regclass('legacy_archive.assets') AS archived",
    );
    expect(schema.rows[0]).toMatchObject({ active: null, archived: 'legacy_archive.assets' });
  });
  it('discovers immutable native files and enforces access before search and bookmarks', async () => {
    const files = addHarnessTemplate([], 'gemini-cli', 'skill', 'discoverable-skill').files;
    const created = await post('/harnesses', ownerToken)
      .send({
        name: 'Discoverable Harness',
        slug: 'discoverable-harness',
        description: 'Inspect immutable native skill source.',
        visibility: 'public',
        files,
      })
      .expect(201);
    const id = created.body.id;
    expect(
      (await get('/harnesses/discover?q=Discoverable', ownerToken).expect(200)).body.total,
    ).toBe(0);
    const release = await post('/harnesses/' + id + '/releases', ownerToken)
      .send({ revision: 1, version: '1.0.0', notes: 'Published native skill' })
      .expect(201);
    const draft = files.map((file) => ({
      ...file,
      content: file.content + '\\nUnpublished unique draft words.',
    }));
    await request(app)
      .put('/api/harnesses/' + id + '/files')
      .set('Origin', origin)
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({ revision: 1, files: draft })
      .expect(200);
    expect(
      (await get('/harnesses/discover?q=Unpublished', ownerToken).expect(200)).body.total,
    ).toBe(0);
    const result = (await get('/harnesses/discover?type=skill&q=discoverable-skill').expect(200))
      .body;
    expect(result.items[0]).toMatchObject({
      harnessId: id,
      releaseId: release.body.id,
      path: '.gemini/skills/discoverable-skill/SKILL.md',
    });
    const privateHarness = await post('/harnesses', ownerToken)
      .send({
        name: 'Secret Harness',
        slug: 'secret-harness',
        description: 'Private indexed native configurations.',
        visibility: 'private',
        files: addHarnessTemplate([], 'copilot-vscode', 'agent', 'secret-agent').files,
      })
      .expect(201);
    await post('/harnesses/' + privateHarness.body.id + '/releases', ownerToken)
      .send({ revision: 1, version: '1.0.0', notes: 'Private reviewed files' })
      .expect(201);
    const anonymous = (await get('/harnesses/discover?q=secret-agent').expect(200)).body;
    expect(anonymous.total).toBe(0);
    expect(anonymous.runtimes).not.toContain('Copilot');
    expect(
      (await get('/harnesses/discover?q=secret-agent', ownerToken).expect(200)).body.total,
    ).toBe(1);
    await request(app)
      .put('/api/harnesses/' + privateHarness.body.id + '/save')
      .set('Origin', origin)
      .set('Authorization', 'Bearer ' + otherToken)
      .expect(404);
    await request(app)
      .put('/api/harnesses/' + id + '/save')
      .set('Origin', origin)
      .set('Authorization', 'Bearer ' + otherToken)
      .expect(204);
    expect((await get('/harnesses/saved', otherToken).expect(200)).body.items[0].harnessId).toBe(
      id,
    );
  });
  const saveFiles = (
    id: string,
    revision: number,
    files: { path: string; content: string }[],
    token = ownerToken,
  ) =>
    request(app)
      .put('/api/harnesses/' + id + '/files')
      .set('Origin', origin)
      .set('Authorization', 'Bearer ' + token)
      .send({ revision, files });
  it('publishes native MCP/hooks together, hides raw drafts, and exports stable snapshots', async () => {
    let files = addHarnessTemplate([], 'gemini-cli', 'mcp', 'delivery').files;
    files = addHarnessTemplate(files, 'gemini-cli', 'hook', 'review', 'post').files;
    const created = await post('/harnesses', ownerToken)
      .send({
        name: 'Delivery Harness',
        slug: 'delivery-harness',
        description: 'Native configurations for delivery.',
        visibility: 'public',
        files,
      })
      .expect(201);
    const id = created.body.id;
    expect((await get('/harnesses/' + id).expect(200)).body.files).toEqual([]);
    expect(
      (await get('/harnesses?scope=workspace', otherToken).expect(200)).body.items.some(
        (item: { id: string }) => item.id === id,
      ),
    ).toBe(false);
    const published = await post('/harnesses/' + id + '/releases', ownerToken)
      .send({ revision: 1, version: '1.0.0', notes: 'Native MCP and hooks together' })
      .expect(201);
    expect((await get('/harnesses/' + id).expect(200)).body.files).toEqual(files);
    const draft = [...files, { path: 'private-notes.md', content: 'Draft only' }];
    await saveFiles(id, 1, draft).expect(200);
    await saveFiles(id, 1, files).expect(409);
    expect((await get('/harnesses/' + id).expect(200)).body.files).toEqual(files);
    expect((await get('/harnesses/' + id, ownerToken).expect(200)).body.files).toEqual(draft);
    const release = await get('/harnesses/' + id + '/releases/' + published.body.id).expect(200);
    expect(release.body.files).toEqual(files);
    const archive = await get('/harnesses/' + id + '/releases/' + published.body.id + '/export')
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const unzipped = unzipSync(archive.body);
    expect(Object.keys(unzipped).sort()).toEqual(files.map((file) => file.path).sort());
    for (const file of files) expect(strFromU8(unzipped[file.path]!)).toBe(file.content);
  });
  it('retains incomplete JSON in drafts but refuses invalid native configuration releases', async () => {
    const files = [{ path: '.claude/settings.json', content: '{"hooks":' }];
    const created = await post('/harnesses', ownerToken)
      .send({
        name: 'Incomplete Harness',
        slug: 'incomplete-harness',
        description: 'Drafts can preserve incomplete files.',
        visibility: 'private',
        files,
      })
      .expect(201);
    expect((await get('/harnesses/' + created.body.id, ownerToken).expect(200)).body.files).toEqual(
      files,
    );
    const result = await post('/harnesses/' + created.body.id + '/releases', ownerToken)
      .send({ revision: 1, version: '1.0.0', notes: 'Incomplete configuration' })
      .expect(422);
    expect(result.body.error.code).toBe('INVALID_CONFIGURATION');
    expect(
      (await get('/harnesses/' + created.body.id + '/releases', ownerToken).expect(200)).body.items,
    ).toEqual([]);
  });
  it('requires an explicit invite for private release access and keeps viewers read-only', async () => {
    const files = addHarnessTemplate([], 'claude-code', 'mcp', 'team-tools').files;
    const created = await post('/harnesses', ownerToken)
      .send({
        name: 'Team Harness',
        slug: 'team-harness',
        description: 'Shared release access for teammates.',
        visibility: 'team',
        files,
      })
      .expect(201);
    const id = created.body.id;
    const published = await post('/harnesses/' + id + '/releases', ownerToken)
      .send({ revision: 1, version: '1.0.0', notes: 'Share reviewed configuration' })
      .expect(201);
    await get('/harnesses/' + id).expect(404);
    await get('/harnesses/' + id, otherToken).expect(404);
    await get('/harnesses/' + id + '/releases/' + published.body.id + '/export', otherToken).expect(
      404,
    );
    await post('/harnesses/' + id + '/members', ownerToken)
      .send({ email: 'other@example.com' })
      .expect(204);
    expect(
      (await get('/harnesses?scope=workspace', otherToken).expect(200)).body.items.some(
        (item: { id: string }) => item.id === id,
      ),
    ).toBe(true);
    expect((await get('/harnesses/' + id, otherToken).expect(200)).body.files).toEqual(files);
    await saveFiles(id, 1, [], otherToken).expect(404);
    await post('/harnesses/' + id + '/releases', otherToken)
      .send({ revision: 1, version: '2.0.0', notes: 'Viewer cannot publish' })
      .expect(404);
  });
});

describe('creator profiles', () => {
  const update = {
    name: 'Owner profile',
    bio: 'I build native AI review tools.',
    location: 'Bhubaneswar',
    company: 'Delivery team',
    website: 'https://example.com',
    github: 'example-user',
  };
  const patchProfile = (token?: string) => {
    const req = request(app).patch('/api/users/me').set('Origin', origin);
    return token ? req.set('Authorization', 'Bearer ' + token) : req;
  };
  it('returns public details without email, authentication data, or account revision', async () => {
    const response = await get('/users/' + ownerId).expect(200);
    expect(Object.keys(response.body).sort()).toEqual(
      [
        'bio',
        'company',
        'createdAt',
        'github',
        'harnesses',
        'id',
        'location',
        'name',
        'stats',
        'website',
      ].sort(),
    );
    expect(response.body.account).toBeUndefined();
    expect(response.body.email).toBeUndefined();
    expect(response.body.passwordHash).toBeUndefined();
    await get('/users/me').expect(401);
    await get('/users/not-a-uuid').expect(422);
    await get('/users/' + randomUUID()).expect(404);
  });
  it('persists validated own edits and leaves another account unchanged', async () => {
    const before = (await get('/users/me', ownerToken).expect(200)).body;
    const otherBefore = (await get('/users/me', otherToken).expect(200)).body;
    const saved = await patchProfile(ownerToken)
      .send({ ...update, name: '  Owner profile  ', revision: before.account.revision })
      .expect(200);
    expect(saved.body).toMatchObject(update);
    expect(saved.body.account).toEqual({
      email: 'owner@example.com',
      verified: true,
      revision: before.account.revision + 1,
      role: 'user',
    });
    expect((await get('/users/' + ownerId).expect(200)).body).toMatchObject(update);
    expect((await get('/users/me', otherToken).expect(200)).body.name).toBe(otherBefore.name);
    expect((await get('/auth/me', ownerToken).expect(200)).body.user.name).toBe(update.name);
  });
  it('rejects invalid links, oversized fields, mass assignment, and unauthenticated updates', async () => {
    const profile = (await get('/users/me', ownerToken)).body;
    const input = { ...update, revision: profile.account.revision };
    await patchProfile().send(input).expect(401);
    for (const invalid of [
      { website: 'javascript:alert(1)' },
      { website: 'https://user:password@example.com' },
      { bio: 'a'.repeat(601) },
      { name: ' ' },
      { github: '../something' },
      { email: 'attacker@example.com' },
      { id: randomUUID() },
    ])
      await patchProfile(ownerToken)
        .send({ ...input, ...invalid })
        .expect(422);
    expect((await get('/users/me', ownerToken)).body.account.revision).toBe(input.revision);
    expect((await get('/users/me', ownerToken)).body.website).toBe(update.website);
  });
  it('detects concurrent updates and retains the accepted revision', async () => {
    const profile = (await get('/users/me', ownerToken)).body;
    const revision = profile.account.revision;
    await patchProfile(ownerToken)
      .send({ ...update, bio: 'Saved in another session.', revision })
      .expect(200);
    const conflict = await patchProfile(ownerToken)
      .send({ ...update, bio: 'Stale draft.', revision })
      .expect(409);
    expect(conflict.body.error.code).toBe('PROFILE_CONFLICT');
    expect((await get('/users/' + ownerId)).body.bio).toBe('Saved in another session.');
  });
  it('excludes private, team, and unpublished Harnesses from lists and all statistics', async () => {
    const baseline = (await get('/users/' + ownerId)).body;
    const files = [
      { path: '.claude/agents/profile-review.md', content: 'Review code for clarity.' },
    ];
    const ids: string[] = [];
    for (const [visibility, publish] of [
      ['public', true],
      ['private', true],
      ['team', true],
      ['public', false],
    ] as const) {
      const fixture = await post('/harnesses', ownerToken)
        .send({
          name: 'Profile fixture ' + ids.length,
          slug: 'profile-fixture-' + randomUUID(),
          description: 'Native files for profile access checks.',
          visibility,
          files,
        })
        .expect(201);
      ids.push(fixture.body.id);
      if (publish)
        await post('/harnesses/' + fixture.body.id + '/releases', ownerToken)
          .send({ revision: 1, version: '1.0.0', notes: 'Publish profile fixture.' })
          .expect(201);
    }
    await post('/harnesses/' + ids[0] + '/releases', ownerToken)
      .send({ revision: 1, version: '1.1.0', notes: 'Second public release.' })
      .expect(201);
    for (const token of [undefined, ownerToken, otherToken]) {
      const profile = (await get('/users/' + ownerId, token).expect(200)).body;
      expect(profile.stats).toEqual({
        harnesses: baseline.stats.harnesses + 1,
        releases: baseline.stats.releases + 2,
        files: baseline.stats.files + 1,
      });
      const visibleIds = profile.harnesses.items.map((item: { id: string }) => item.id);
      expect(visibleIds).toContain(ids[0]);
      for (const id of ids.slice(1)) expect(visibleIds).not.toContain(id);
      expect(
        profile.harnesses.items.find((item: { id: string }) => item.id === ids[0]).version,
      ).toBe('1.1.0');
    }
    await state.db.query("UPDATE harnesses SET visibility='private' WHERE id=$1", [ids[0]]);
    expect((await get('/users/' + ownerId)).body.stats).toEqual(baseline.stats);
  });
  it('refuses account edits from CLI credentials with Harness-only scopes', async () => {
    const { tokens } = await cliLogin(ownerToken);
    await get('/users/me', tokens.access_token).expect(403);
    await patchProfile(tokens.access_token)
      .send({ ...update, revision: 1 })
      .expect(403);
  });
});

describe('platform administration and database-backed roles', () => {
  const roleRequest = (token: string, id: string) =>
    request(app)
      .patch(`/api/admin/users/${id}/role`)
      .set('Origin', origin)
      .set('Authorization', `Bearer ${token}`);
  it('defaults registration to user and rejects role injection', async () => {
    expect((await get('/auth/me', ownerToken).expect(200)).body.user.role).toBe('user');
    await post('/auth/register')
      .send({
        name: 'Injected admin',
        email: 'injected@example.com',
        password: 'long-unique-password',
        role: 'admin',
      })
      .expect(422);
    await post('/auth/register')
      .send({
        name: 'Unverified account',
        email: 'unverified-admin@example.com',
        password: 'long-unique-password',
      })
      .expect(201);
    const result = await state.db.query<{ role: string }>(
      "SELECT role FROM users WHERE email='unverified-admin@example.com'",
    );
    expect(result.rows[0].role).toBe('user');
    const profile = (await get('/users/me', ownerToken)).body;
    await request(app)
      .patch('/api/users/me')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Owner',
        bio: '',
        location: '',
        company: '',
        website: '',
        github: '',
        revision: profile.account.revision,
        role: 'admin',
      })
      .expect(422);
  });
  it('blocks anonymous users, ordinary users, and even signed JWTs with an injected admin claim', async () => {
    for (const endpoint of ['overview', 'users', 'harnesses', 'activity', 'health']) {
      await get('/admin/' + endpoint).expect(401);
      await get('/admin/' + endpoint, ownerToken).expect(403);
    }
    const payload = decodeJwt(ownerToken);
    const forged = await new SignJWT({ ...payload, role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode(config.JWT_SECRET));
    await get('/admin/users', forged).expect(403);
    await roleRequest(ownerToken, ownerId).send({ role: 'admin', revision: 1 }).expect(403);
    await state.db.query("UPDATE users SET role='admin' WHERE id=$1", [ownerId]);
    expect((await get('/auth/me', ownerToken).expect(200)).body.user.role).toBe('admin');
  });
  it('returns actual aggregates, filtered pagination, activity, and measured process health without private contents', async () => {
    for (const days of [7, 30, 90]) {
      const overview = (await get('/admin/overview?days=' + days, ownerToken).expect(200)).body;
      expect(overview.trend).toHaveLength(days);
      expect(overview.totals.admins).toBe(1);
      expect(overview.totals.harnesses).toBe(
        overview.totals.public + overview.totals.private + overview.totals.team,
      );
      for (const kind of ['users', 'releases', 'revisions'])
        expect(overview.period[kind]).toBe(
          overview.trend.reduce(
            (total: number, day: Record<string, number>) => total + day[kind],
            0,
          ),
        );
    }
    const users = (await get('/admin/users?role=admin&q=owner&page=10000', ownerToken).expect(200))
      .body;
    expect(users.total).toBe(1);
    expect(users.page).toBe(1);
    expect(users.items[0].role).toBe('admin');
    expect(users.items[0]).not.toHaveProperty('password_hash');
    expect(users.items[0]).not.toHaveProperty('refreshToken');
    expect((await get('/admin/users?q=%25', ownerToken)).body.items).toHaveLength(0);
    const harnesses = (await get('/admin/harnesses?visibility=private', ownerToken).expect(200))
      .body;
    expect(harnesses.total).toBeGreaterThan(0);
    for (const harness of harnesses.items) {
      expect(harness.visibility).toBe('private');
      expect(harness).not.toHaveProperty('draft_files');
      expect(harness).not.toHaveProperty('files');
    }
    const activity = (await get('/admin/activity?group=access', ownerToken).expect(200)).body;
    expect(
      activity.items.some((event: { action: string }) => event.action === 'admin.access_denied'),
    ).toBe(true);
    expect(activity.items.every((event: { group: string }) => event.group === 'access')).toBe(true);
    const health = (await get('/admin/health', ownerToken).expect(200)).body;
    expect(health.database.status).toBe('healthy');
    expect(health.api.requests).toBeGreaterThan(0);
    expect(health.api.rejected).toBeGreaterThan(0);
    expect(health.api.p95Ms).toBeGreaterThanOrEqual(0);
    await get('/admin/overview?days=100', ownerToken).expect(422);
    const { tokens } = await cliLogin(ownerToken);
    await get('/admin/overview', tokens.access_token).expect(403);
  });
  it('changes roles with revision checks, preserves the last admin, and takes effect on existing access tokens', async () => {
    const other = (await get('/auth/me', otherToken)).body.user;
    const listing = (await get('/admin/users?q=other%40example.com', ownerToken)).body.items[0];
    const revision = listing.revision;
    const last = await roleRequest(ownerToken, ownerId)
      .send({ role: 'user', revision: 1 })
      .expect(409);
    expect(last.body.error.code).toBe('LAST_ADMIN');
    const unverified = (await get('/admin/users?q=unverified-admin', ownerToken)).body.items[0];
    await roleRequest(ownerToken, unverified.id)
      .send({ role: 'admin', revision: unverified.revision })
      .expect(409);
    await roleRequest(ownerToken, other.id).send({ role: 'root', revision }).expect(422);
    const promoted = await roleRequest(ownerToken, other.id)
      .send({ role: 'admin', revision })
      .expect(200);
    expect(promoted.body).toEqual({ role: 'admin', revision: revision + 1 });
    await get('/admin/health', otherToken).expect(200);
    expect((await get('/auth/me', otherToken)).body.user.role).toBe('admin');
    const stale = await roleRequest(ownerToken, other.id)
      .send({ role: 'user', revision })
      .expect(409);
    expect(stale.body.error.code).toBe('ROLE_CONFLICT');
    const self = await roleRequest(ownerToken, ownerId)
      .send({ role: 'user', revision: 1 })
      .expect(409);
    expect(self.body.error.code).toBe('SELF_DEMOTION');
    const auditsBefore = (
      await state.db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM admin_audit_events WHERE action='user.role_changed'",
      )
    ).rows[0].count;
    await roleRequest(ownerToken, other.id)
      .send({ role: 'admin', revision: revision + 1 })
      .expect(200);
    expect(
      (
        await state.db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM admin_audit_events WHERE action='user.role_changed'",
        )
      ).rows[0].count,
    ).toBe(auditsBefore);
    await roleRequest(ownerToken, other.id)
      .send({ role: 'user', revision: revision + 1 })
      .expect(200);
    await get('/admin/health', otherToken).expect(403);
    expect((await get('/auth/me', otherToken)).body.user.role).toBe('user');
    const audit = (await get('/admin/activity?group=accounts', ownerToken)).body;
    expect(
      audit.items.some(
        (event: { action: string; summary: string }) =>
          event.action === 'user.role_changed' && event.summary.includes('admin to user'),
      ),
    ).toBe(true);
    expect((await get('/users/' + ownerId)).body).not.toHaveProperty('role');
    const otherPrivate = await post('/harnesses', otherToken)
      .send({
        name: 'Private admin boundary',
        slug: 'private-admin-boundary',
        description: 'No access bypass for administrator.',
        visibility: 'private',
        files: [{ path: 'README.md', content: 'Private content' }],
      })
      .expect(201);
    await get('/harnesses/' + otherPrivate.body.id, ownerToken).expect(404);
  });
  it('serializes concurrent demotions and retains an administrator', async () => {
    const other = (await get('/admin/users?q=other%40example.com', ownerToken)).body.items[0];
    const promoted = (
      await roleRequest(ownerToken, other.id).send({ role: 'admin', revision: other.revision })
    ).body;
    const responses = await Promise.all([
      roleRequest(ownerToken, other.id).send({ role: 'user', revision: promoted.revision }),
      roleRequest(otherToken, ownerId).send({ role: 'user', revision: 1 }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 403]);
    const admins = (await state.db.query<{ id: string }>("SELECT id FROM users WHERE role='admin'"))
      .rows;
    expect(admins).toHaveLength(1);
    // Restore fixture roles regardless of which concurrent request acquired the lock first.
    await state.db.query("UPDATE users SET role='user' WHERE id=ANY($1::uuid[])", [
      [ownerId, other.id],
    ]);
  });
});

describe('synchronization audit fixes', () => {
  async function fixture(files = [{ path: 'AGENTS.md', content: 'Review proposed changes.' }]) {
    return (
      await post('/harnesses', ownerToken)
        .send({
          name: 'Sync audit',
          slug: 'sync-audit-' + randomUUID(),
          description: 'Regression coverage for synchronization integrity.',
          visibility: 'private',
          files,
        })
        .expect(201)
    ).body;
  }
  it('rejects ambiguous trees and invalid versions through the HTTP boundary', async () => {
    await post('/harnesses', ownerToken)
      .send({
        name: 'Collision',
        slug: 'collision-audit',
        description: 'Ambiguous native tree validation.',
        visibility: 'private',
        files: [
          { path: '.claude/agents', content: '' },
          { path: '.claude/agents/a.md', content: '' },
        ],
      })
      .expect(422);
    const h = await fixture();
    await post('/harnesses/' + h.id + '/releases', ownerToken)
      .send({ revision: 1, version: '01.02.03', notes: 'Invalid version' })
      .expect(422);
    await post('/harnesses/' + h.id + '/releases', ownerToken)
      .send({ revision: 1, version: '1.0.0', notes: 'Wrong checksum', treeHash: '0'.repeat(64) })
      .expect(409);
  });
  it('checks literal credentials across every publication entry and unselected profile', async () => {
    const h = await fixture([
      {
        path: '.mcp.json',
        content: JSON.stringify({
          mcpServers: {
            test: {
              command: 'node',
              args: ['server.js'],
              env: { API_KEY: 'synthetic-not-a-real-credential' },
            },
          },
        }),
      },
    ]);
    const body = { revision: 1, version: '1.0.0', notes: 'Unsafe configuration test' };
    const browser = await post('/harnesses/' + h.id + '/releases', ownerToken)
      .send(body)
      .expect(422);
    expect(browser.body.error.code).toBe('UNSAFE_RELEASE');
    expect(browser.body.error.message).not.toContain('synthetic-not-a-real');
    const login = await cliLogin(ownerToken);
    await request(app)
      .post('/api/harnesses/' + h.id + '/releases')
      .set('Authorization', 'Bearer ' + login.tokens.access_token)
      .send(body)
      .expect(422);
    expect((await get('/harnesses/' + h.id + '/releases', ownerToken)).body.items).toEqual([]);
  });
  it('accepts escaped snapshots larger than the old JSON limit and keeps revisions/releases immutable', async () => {
    const files = Array.from({ length: 20 }, (_, i) => ({
      path: `.claude/agents/${i}.md`,
      content: '\n'.repeat(250000),
    }));
    expect(Buffer.byteLength(JSON.stringify({ files }))).toBeLessThan(harnessJSONLimit);
    const h = await fixture(files);
    const release = await post('/harnesses/' + h.id + '/releases', ownerToken)
      .send({
        revision: 1,
        version: '1.0.0',
        notes: 'Maximum text snapshot',
        treeHash: treeHash(files),
      })
      .expect(201);
    const rows = (
      await pool.query('SELECT tree_hash,revision_id FROM harness_releases WHERE id=$1', [
        release.body.id,
      ])
    ).rows;
    expect(rows[0].tree_hash).toBe(treeHash(files));
    expect(rows[0].revision_id).toBeTruthy();
    await expect(
      pool.query("UPDATE harness_releases SET files='[]'::jsonb WHERE id=$1", [release.body.id]),
    ).rejects.toThrow('immutable');
    await expect(
      pool.query("UPDATE harness_revisions SET files='[]'::jsonb WHERE id=$1", [
        rows[0].revision_id,
      ]),
    ).rejects.toThrow('immutable');
  });
  it('keeps latest on the highest stable release after a lower backport is published', async () => {
    const h = await fixture();
    for (const version of ['2.0.0', '1.10.0', '1.9.9'])
      await post('/harnesses/' + h.id + '/releases', ownerToken)
        .send({ revision: 1, version, notes: 'Stable release policy' })
        .expect(201);
    expect(
      (await get('/harnesses/' + h.id + '/manifest?ref=latest', ownerToken)).body.version,
    ).toBe('2.0.0');
    expect((await get('/harnesses/' + h.id + '/releases', ownerToken)).body.items[0].version).toBe(
      '2.0.0',
    );
    expect((await get('/harnesses/' + h.id + '/manifest?ref=1.9.9', ownerToken)).body.version).toBe(
      '1.9.9',
    );
  });
  it('paginates beyond 100 revisions without duplicates when a new head is created', async () => {
    const h = await fixture();
    await pool.query(
      `INSERT INTO harness_revisions(id,harness_id,revision,files,author_id,source,message,tree_hash)
      SELECT md5($1 || ':' || n)::uuid,$1::uuid,n,$2::jsonb,$3::uuid,'web','History fixture',$4 FROM generate_series(2,125) n`,
      [h.id, JSON.stringify(h.files), ownerId, treeHash(h.files)],
    );
    const first = (await get('/harnesses/' + h.id + '/revisions?limit=50', ownerToken).expect(200))
      .body;
    expect(first.items).toHaveLength(50);
    await pool.query(
      "INSERT INTO harness_revisions(id,harness_id,revision,files,source,message,tree_hash) VALUES($1,$2,126,$3,'web','New head',$4)",
      [randomUUID(), h.id, JSON.stringify(h.files), treeHash(h.files)],
    );
    const second = (
      await get('/harnesses/' + h.id + '/revisions?limit=50&before=' + first.nextCursor, ownerToken)
    ).body;
    const third = (
      await get(
        '/harnesses/' + h.id + '/revisions?limit=50&before=' + second.nextCursor,
        ownerToken,
      )
    ).body;
    const numbers = [...first.items, ...second.items, ...third.items].map((r) => r.revision);
    expect(numbers).toHaveLength(125);
    expect(new Set(numbers).size).toBe(125);
    expect(third.nextCursor).toBeNull();
    await get('/harnesses/' + h.id + '/revisions?before=invalid', ownerToken).expect(422);
    await get('/harnesses/' + h.id + '/revisions?before=10', otherToken).expect(404);
  });
  it('compacts acknowledgements without changing replays and reports read-only capability accurately', async () => {
    const h = await fixture();
    const readOnly = await cliLogin(ownerToken, 'harness:read');
    const manifest = (
      await get('/harnesses/' + h.id + '/manifest?ref=draft', readOnly.tokens.access_token).expect(
        200,
      )
    ).body;
    expect(manifest.canWrite).toBe(false);
    expect(manifest.canPublish).toBe(false);
    const input = {
      revision: 1,
      requestId: randomUUID(),
      profiles: ['claude-code'],
      message: 'Record acknowledged change',
      upsert: [{ path: 'AGENTS.md', content: 'Updated instructions.' }],
      remove: [],
    };
    const first = (
      await post('/harnesses/' + h.id + '/changesets', ownerToken)
        .send(input)
        .expect(200)
    ).body;
    const receipt = (
      await pool.query('SELECT result FROM harness_changesets WHERE harness_id=$1', [h.id])
    ).rows[0].result;
    expect(receipt.files).toBeUndefined();
    expect(receipt.revisionId).toBeTruthy();
    await request(app)
      .put('/api/harnesses/' + h.id + '/files')
      .set('Origin', origin)
      .set('Authorization', 'Bearer ' + ownerToken)
      .send({ revision: 2, files: [{ path: 'AGENTS.md', content: 'Later server edit.' }] })
      .expect(200);
    const replay = (
      await post('/harnesses/' + h.id + '/changesets', ownerToken)
        .send(input)
        .expect(200)
    ).body;
    expect(replay).toEqual(first);
    const history = (await get('/harnesses/' + h.id + '/revisions', ownerToken)).body.items;
    expect(history[0].parentId).toBe(history[1].id);
    await backfillSyncIntegrity(pool);
    expect(
      (
        await post('/harnesses/' + h.id + '/changesets', ownerToken)
          .send(input)
          .expect(200)
      ).body,
    ).toEqual(first);
  });
});

describe('Harness collaboration and restricted device authorization', () => {
  beforeEach(() => {
    apiRequestLimit.resetKey('127.0.0.1');
    apiRequestLimit.resetKey('::/56');
  });
  let harnessId: string,
    editorToken: string,
    publisherToken: string,
    publisherId: string,
    viewerId: string;
  const files = [{ path: 'AGENTS.md', content: 'Original reviewed instructions.' }];
  async function account(name: string) {
    const email = name.toLowerCase() + '@collaboration.test';
    await post('/auth/register')
      .send({ name, email, password: 'Collaboration-test-password-2026!' })
      .expect(201);
    const code = state.outbox.find((m) => m.email === email && m.purpose === 'verify_email')!.code;
    return (await post('/auth/verify-email').send({ email, code }).expect(200)).body;
  }
  const put = (path: string, token: string, body: unknown) =>
    request(app)
      .put('/api' + path)
      .set('Origin', origin)
      .set('Authorization', 'Bearer ' + token)
      .send(body);
  it('grants independent editor/publisher/viewer roles and enforces each capability', async () => {
    const editor = await account('Editor'),
      publisher = await account('Publisher');
    editorToken = editor.accessToken;
    publisherToken = publisher.accessToken;
    publisherId = publisher.user.id;
    viewerId = (await get('/auth/me', otherToken)).body.user.id;
    const h = (
      await post('/harnesses', ownerToken)
        .send({
          name: 'Collaborative Harness',
          slug: 'collaborative-harness',
          description: 'Test reviewed native file contributions.',
          visibility: 'private',
          files,
        })
        .expect(201)
    ).body;
    harnessId = h.id;
    await get('/harnesses/' + h.id, editorToken).expect(404);
    for (const [email, role] of [
      ['editor@collaboration.test', 'editor'],
      ['publisher@collaboration.test', 'publisher'],
      ['other@example.com', 'viewer'],
    ])
      await post('/harnesses/' + h.id + '/members', ownerToken)
        .send({ email, role })
        .expect(204);
    await post('/harnesses/' + h.id + '/members', editorToken)
      .send({ email: 'owner@example.com', role: 'publisher' })
      .expect(404);
    const editorView = (await get('/harnesses/' + h.id, editorToken).expect(200)).body;
    expect(editorView.capabilities).toMatchObject({
      role: 'editor',
      canEdit: true,
      canPublish: false,
    });
    expect(editorView.files).toEqual(files);
    expect((await get('/harnesses/' + h.id, publisherToken)).body.capabilities).toMatchObject({
      role: 'publisher',
      canEdit: false,
      canPublish: true,
    });
    expect((await get('/harnesses/' + h.id, otherToken)).body.files).toEqual([]);
    await get('/harnesses/' + h.id + '/manifest?ref=draft', otherToken).expect(404);
    await put('/harnesses/' + h.id + '/files', publisherToken, { revision: 1, files }).expect(404);
    await put('/harnesses/' + h.id + '/files', otherToken, { revision: 1, files }).expect(404);
    const changed = [{ path: 'AGENTS.md', content: 'Editor changed instructions.' }];
    await put('/harnesses/' + h.id + '/files', editorToken, { revision: 1, files: changed }).expect(
      200,
    );
    await post('/harnesses/' + h.id + '/releases', editorToken)
      .send({ revision: 2, version: '1.0.0', notes: 'Review this release.' })
      .expect(404);
    await post('/harnesses/' + h.id + '/releases', publisherToken)
      .send({ revision: 2, version: '1.0.0', notes: 'Publish reviewed instructions.' })
      .expect(201);
    expect((await get('/harnesses/' + h.id, otherToken)).body.files).toEqual(changed);
    await get('/harnesses/' + h.id + '/revisions', publisherToken).expect(200);
    const cli = (await cliLogin(editorToken)).tokens.access_token;
    expect((await get('/harnesses/' + h.id + '/manifest?ref=draft', cli)).body).toMatchObject({
      canWrite: true,
      canPublish: false,
    });
    const publisherCli = (await cliLogin(publisherToken)).tokens.access_token;
    expect(
      (await get('/harnesses/' + h.id + '/manifest?ref=draft', publisherCli)).body,
    ).toMatchObject({ canWrite: false, canPublish: true });
    await pool.query("UPDATE users SET role='admin' WHERE id=$1", [viewerId]);
    await put('/harnesses/' + h.id + '/files', otherToken, { revision: 2, files }).expect(404);
    await pool.query("UPDATE users SET role='user' WHERE id=$1", [viewerId]);
  });
  it('protects direct edits, pins reviews, rejects self approval and merges into immutable history', async () => {
    const receiptInput = {
      requestId: randomUUID(),
      revision: 2,
      profiles: ['claude-code'],
      message: 'Receipt before draft protection',
      upsert: [],
      remove: [],
    };
    const acknowledged = (
      await post('/harnesses/' + harnessId + '/changesets', editorToken)
        .send(receiptInput)
        .expect(200)
    ).body;
    await put('/harnesses/' + harnessId + '/policy', ownerToken, { requireReview: true }).expect(
      204,
    );
    expect(
      (
        await post('/harnesses/' + harnessId + '/changesets', editorToken)
          .send(receiptInput)
          .expect(200)
      ).body,
    ).toEqual(acknowledged);
    const proposed = [{ path: 'AGENTS.md', content: 'Contribution requiring approval.' }];
    expect(
      (
        await put('/harnesses/' + harnessId + '/files', editorToken, {
          revision: 2,
          files: proposed,
        }).expect(409)
      ).body.error.code,
    ).toBe('REVIEW_REQUIRED');
    await post('/harnesses/' + harnessId + '/changesets', ownerToken)
      .send({
        requestId: randomUUID(),
        revision: 2,
        profiles: ['claude-code'],
        message: 'Attempt protected push',
        upsert: proposed,
        remove: [],
      })
      .expect(409);
    const p = (
      await post('/harnesses/' + harnessId + '/proposals', editorToken)
        .send({
          title: 'Improve review instructions',
          revision: 2,
          files: proposed,
          source: { kind: 'git', commit: 'a'.repeat(40) },
        })
        .expect(201)
    ).body;
    const reviewed = () => ({ treeHash: p.treeHash, comment: 'Reviewed the exact native diff.' });
    await post('/harnesses/' + harnessId + '/proposals/' + p.id + '/approve', editorToken)
      .send(reviewed())
      .expect(404);
    await post('/harnesses/' + harnessId + '/proposals/' + p.id + '/merge', ownerToken)
      .send({ ...reviewed(), revision: 2 })
      .expect(409);
    await post('/harnesses/' + harnessId + '/proposals/' + p.id + '/approve', publisherToken)
      .send({ treeHash: 'b'.repeat(64) })
      .expect(409);
    await post('/harnesses/' + harnessId + '/proposals/' + p.id + '/approve', publisherToken)
      .send(reviewed())
      .expect(204);
    await post('/harnesses/' + harnessId + '/proposals/' + p.id + '/merge', ownerToken)
      .send({ ...reviewed(), revision: 2 })
      .expect(200);
    expect((await get('/harnesses/' + harnessId, ownerToken)).body).toMatchObject({
      revision: 3,
      files: proposed,
    });
    expect((await get('/harnesses/' + harnessId, otherToken)).body.files[0].content).toBe(
      'Editor changed instructions.',
    );
    expect(
      (await get('/harnesses/' + harnessId + '/revisions', ownerToken)).body.items[0],
    ).toMatchObject({ source: 'proposal', revision: 3 });
    await post('/harnesses/' + harnessId + '/proposals/' + p.id + '/merge', ownerToken)
      .send({ ...reviewed(), revision: 3 })
      .expect(409);
    await expect(
      pool.query("UPDATE harness_proposals SET files='[]' WHERE id=$1", [p.id]),
    ).rejects.toThrow(/immutable/i);
    const own = (
      await post('/harnesses/' + harnessId + '/proposals', ownerToken)
        .send({ title: 'Owner proposed changes', revision: 3, files })
        .expect(201)
    ).body;
    await post('/harnesses/' + harnessId + '/proposals/' + own.id + '/approve', ownerToken)
      .send({ treeHash: own.treeHash })
      .expect(403);
    const device = (await cliLogin(publisherToken)).tokens.access_token;
    await post('/harnesses/' + harnessId + '/proposals/' + own.id + '/approve', device)
      .send({ treeHash: own.treeHash })
      .expect(403);
    await post('/harnesses/' + harnessId + '/proposals/' + own.id + '/approve', publisherToken)
      .send({ treeHash: own.treeHash })
      .expect(204);
    await post('/harnesses/' + harnessId + '/members', ownerToken)
      .send({ email: 'publisher@collaboration.test', role: 'viewer' })
      .expect(204);
    await post('/harnesses/' + harnessId + '/proposals/' + own.id + '/merge', ownerToken)
      .send({ treeHash: own.treeHash, revision: 3 })
      .expect(409);
    await post('/harnesses/' + harnessId + '/members', ownerToken)
      .send({ email: 'publisher@collaboration.test', role: 'publisher' })
      .expect(204);
    // A stale proposal does not discard a newer reviewed draft.
    await put('/harnesses/' + harnessId + '/policy', ownerToken, { requireReview: false }).expect(
      204,
    );
    await put('/harnesses/' + harnessId + '/files', editorToken, {
      revision: 3,
      files: [{ path: 'AGENTS.md', content: 'Later independent edit.' }],
    }).expect(200);
    await post('/harnesses/' + harnessId + '/proposals/' + own.id + '/merge', ownerToken)
      .send({ treeHash: own.treeHash, revision: 4 })
      .expect(409);
    expect((await get('/harnesses/' + harnessId, ownerToken)).body.files[0].content).toBe(
      'Later independent edit.',
    );
  });
  it('allows release-based viewer contributions without leaking other proposals or private draft bases', async () => {
    const p = (
      await post('/harnesses/' + harnessId + '/proposals', otherToken)
        .send({
          title: 'Viewer release contribution',
          revision: 2,
          files: [{ path: 'AGENTS.md', content: 'Viewer proposal.' }],
        })
        .expect(201)
    ).body;
    await post('/harnesses/' + harnessId + '/proposals', otherToken)
      .send({ title: 'Guess private draft base', revision: 4, files })
      .expect(404);
    const list = (await get('/harnesses/' + harnessId + '/proposals', otherToken)).body.items;
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(p.id);
    const another = (
      await get('/harnesses/' + harnessId + '/proposals', ownerToken)
    ).body.items.find((r: any) => r.id !== p.id);
    await get('/harnesses/' + harnessId + '/proposals/' + another.id, otherToken).expect(404);
    await post('/harnesses/' + harnessId + '/proposals/' + p.id + '/close', otherToken).expect(204);
    const del = request(app)
      .delete('/api/harnesses/' + harnessId + '/members/' + viewerId)
      .set('Origin', origin)
      .set('Authorization', 'Bearer ' + ownerToken);
    await del.expect(204);
    await get('/harnesses/' + harnessId, otherToken).expect(404);
  });
  it('persists selected Harness device grants through refresh and applies them to all Harness routes', async () => {
    const grant = (
      await request(app)
        .post('/api/oauth/device/code')
        .send({ client_id: 'skillshare-cli', scope: 'harness:read harness:write' })
        .expect(200)
    ).body;
    await post('/auth/device-decision', ownerToken)
      .send({ code: grant.user_code, approve: true, harnessIds: [harnessId] })
      .expect(204);
    const tokens = (
      await request(app)
        .post('/api/oauth/token')
        .send({
          client_id: 'skillshare-cli',
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: grant.device_code,
        })
        .expect(200)
    ).body;
    await get('/harnesses/' + harnessId + '/manifest?ref=draft', tokens.access_token).expect(200);
    await get('/harnesses', tokens.access_token).expect(403);
    await get('/harnesses/' + randomUUID(), tokens.access_token).expect(403);
    await post('/harnesses', tokens.access_token)
      .send({
        name: 'Cannot create',
        slug: 'cannot-create',
        description: 'Restricted session cannot create new Harnesses.',
      })
      .expect(403);
    const refreshed = (
      await request(app)
        .post('/api/oauth/token')
        .send({
          client_id: 'skillshare-cli',
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
        })
        .expect(200)
    ).body;
    await get('/harnesses/' + harnessId + '/manifest?ref=draft', refreshed.access_token).expect(
      200,
    );
    await get('/harnesses/' + randomUUID(), refreshed.access_token).expect(403);
    const devices = (await get('/auth/devices', ownerToken)).body.items;
    expect(
      devices.find((d: any) => d.id === decodeJwt(refreshed.access_token).sid).harnessGrants,
    ).toEqual([harnessId]);
  });
});
