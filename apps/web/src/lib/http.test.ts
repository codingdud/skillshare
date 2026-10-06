import { describe, it, expect } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { createAuthTransport } from './http';
const user = { id: 'user', name: 'Test', email: 'test@example.com', role: 'user' as const };
describe('Axios authentication queue', () => {
  it('restores signed-out state without requesting a protected refresh', async () => {
    const t = createAuthTransport(),
      auth = new MockAdapter(t.auth);
    let session: unknown = 'pending';
    t.subscribe((value) => {
      session = value;
    });
    auth.onPost('/session').reply(200, null);
    await expect(t.restore()).resolves.toBeNull();
    expect(session).toBeNull();
    expect(auth.history.post.map((request) => request.url)).toEqual(['/session']);
  });
  it('shares session restoration and attaches the restored access token', async () => {
    const t = createAuthTransport(),
      auth = new MockAdapter(t.auth, { delayResponse: 10 }),
      mock = new MockAdapter(t.api);
    auth.onPost('/session').reply(200, { user, accessToken: 'restored' });
    await Promise.all([t.restore(), t.restore()]);
    expect(auth.history.post).toHaveLength(1);
    mock
      .onGet('/protected')
      .reply((config) => [200, { authorization: config.headers?.Authorization }]);
    expect((await t.api.get('/protected')).data.authorization).toBe('Bearer restored');
  });
  it('does not replace a newer login with a pending session restoration', async () => {
    const t = createAuthTransport(),
      auth = new MockAdapter(t.auth, { delayResponse: 15 });
    let session: unknown;
    t.subscribe((value) => {
      session = value;
    });
    auth.onPost('/session').reply(200, { user, accessToken: 'old' });
    const restoration = t.restore();
    const rejected = expect(restoration).rejects.toThrow('Session changed');
    t.setSession({ user, accessToken: 'new-login' });
    await rejected;
    expect(session).toEqual({ user, accessToken: 'new-login' });
  });
  it('shares one refresh across simultaneous 401 responses and retries each request', async () => {
    const t = createAuthTransport('/api'),
      mock = new MockAdapter(t.api),
      auth = new MockAdapter(t.auth, { delayResponse: 25 });
    t.setSession({ user, accessToken: 'old' });
    let refreshes = 0;
    mock
      .onGet('/protected')
      .reply((config) =>
        config.headers?.Authorization === 'Bearer new' ? [200, { ok: true }] : [401],
      );
    auth.onPost('/refresh').reply(() => {
      refreshes++;
      return [200, { user, accessToken: 'new' }];
    });
    const responses = await Promise.all(Array.from({ length: 12 }, () => t.api.get('/protected')));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(refreshes).toBe(1);
  });
  it('rejects the whole queue on refresh failure and clears the session', async () => {
    const t = createAuthTransport(),
      mock = new MockAdapter(t.api),
      auth = new MockAdapter(t.auth, { delayResponse: 20 });
    let cleared = false;
    t.subscribe((s) => {
      if (!s) cleared = true;
    });
    t.setSession({ user, accessToken: 'old' });
    mock.onGet('/protected').reply(401);
    auth.onPost('/refresh').reply(401);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => t.api.get('/protected')),
    );
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(auth.history.post).toHaveLength(1);
    expect(cleared).toBe(true);
  });
  it('retries each request at most once even if the refreshed token is rejected', async () => {
    const t = createAuthTransport(),
      mock = new MockAdapter(t.api),
      auth = new MockAdapter(t.auth);
    t.setSession({ user, accessToken: 'old' });
    mock.onGet('/protected').reply(401);
    auth.onPost('/refresh').reply(200, { user, accessToken: 'new' });
    await expect(t.api.get('/protected')).rejects.toThrow();
    expect(mock.history.get).toHaveLength(2);
    expect(auth.history.post).toHaveLength(1);
  });
  it('does not refresh on forbidden errors or unauthenticated public requests', async () => {
    const t = createAuthTransport(),
      mock = new MockAdapter(t.api),
      auth = new MockAdapter(t.auth);
    mock.onGet('/public').reply(401);
    await expect(t.api.get('/public')).rejects.toThrow();
    t.setSession({ user, accessToken: 'old' });
    mock.onGet('/private').reply(403);
    await expect(t.api.get('/private')).rejects.toThrow();
    expect(auth.history.post).toHaveLength(0);
  });
  it('a refresh completing after logout cannot restore the session', async () => {
    const t = createAuthTransport(),
      mock = new MockAdapter(t.api),
      auth = new MockAdapter(t.auth, { delayResponse: 25 });
    let session: unknown;
    t.subscribe((s) => {
      session = s;
    });
    t.setSession({ user, accessToken: 'old' });
    mock.onGet('/protected').reply(401);
    auth.onPost('/refresh').reply(200, { user, accessToken: 'new' });
    auth.onPost('/logout').reply(204);
    const request = t.api.get('/protected');
    const caught = request.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await t.logout();
    await caught;
    expect(session).toBeNull();
    expect(auth.history.post.filter((r) => r.url === '/logout')).toHaveLength(1);
  });
});
