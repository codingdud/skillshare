// Production equivalent of the Vite dev proxy: same-origin /api keeps the strict refresh cookie working.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const target = new URL(url.pathname + url.search, env.VITE_API_URL);
      return fetch(new Request(target, request), { redirect: 'manual' });
    }
    return env.ASSETS.fetch(request);
  },
};
