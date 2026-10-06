import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { AuthResponse } from '@skillshare/contracts';
type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean; _epoch?: number };

const backendUrl = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
export const API_BASE_URL = `${backendUrl}/api`;

export function createAuthTransport(baseURL = API_BASE_URL) {
  const api = axios.create({ baseURL, withCredentials: true, timeout: 15000 });
  const auth = axios.create({ baseURL: `${baseURL}/auth`, withCredentials: true, timeout: 15000 });
  let token: string | null = null,
    epoch = 0;
  let pending: Promise<AuthResponse> | null = null;
  let restoring: Promise<AuthResponse | null> | null = null;
  let onSession: (session: AuthResponse | null) => void = () => {};
  function setSession(session: AuthResponse | null) {
    epoch++;
    token = session?.accessToken ?? null;
    onSession(session);
  }
  function refresh() {
    if (pending) return pending;
    const startedAt = epoch;
    pending = auth
      .post<AuthResponse>('/refresh')
      .then(({ data }) => {
        if (startedAt !== epoch) throw new Error('Session changed while refresh was pending.');
        token = data.accessToken;
        onSession(data);
        return data;
      })
      .catch((error: unknown) => {
        if (startedAt === epoch) {
          token = null;
          onSession(null);
        }
        throw error;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }
  function restore() {
    if (restoring) return restoring;
    const startedAt = epoch;
    restoring = auth
      .post<AuthResponse | null>('/session')
      .then(({ data }) => {
        if (startedAt !== epoch) throw new Error('Session changed while restoration was pending.');
        token = data?.accessToken ?? null;
        onSession(data);
        return data;
      })
      .catch((error: unknown) => {
        if (startedAt === epoch) {
          token = null;
          onSession(null);
        }
        throw error;
      })
      .finally(() => {
        restoring = null;
      });
    return restoring;
  }
  api.interceptors.request.use((config) => {
    const request = config as RetryConfig;
    request._epoch ??= epoch;
    if (request._epoch !== epoch) throw new Error('Session changed.');
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    else request.headers.delete('Authorization');
    return request;
  });
  api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const request = error.config as RetryConfig | undefined;
      if (
        error.response?.status !== 401 ||
        !request ||
        request._retry ||
        !request.headers.get('Authorization') ||
        request._epoch !== epoch
      )
        throw error;
      request._retry = true;
      // A late 401 may belong to the old token after the shared refresh already completed.
      if (!token || request.headers.get('Authorization') === `Bearer ${token}`) await refresh();
      if (request._epoch !== epoch || !token) throw error;
      return api(request);
    },
  );
  return {
    api,
    auth,
    refresh,
    restore,
    setSession,
    subscribe(handler: typeof onSession) {
      onSession = handler;
    },
    async logout() {
      setSession(null);
      if (pending) await pending.catch(() => undefined);
      if (restoring) await restoring.catch(() => undefined);
      await auth.post('/logout');
    },
  };
}
export const transport = createAuthTransport();
export const api = transport.api;
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data?.error?.details?.length)
      return data.error.details
        .map((i: { path: string[]; message: string }) => `${i.path.join('.')}: ${i.message}`)
        .join(' · ');
    return data?.error?.message ?? 'Cannot reach the server. Check your connection and retry.';
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}
