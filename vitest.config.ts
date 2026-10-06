import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      JWT_SECRET: 'test-only-secret-that-is-longer-than-thirty-two-characters',
      WEB_ORIGIN: 'http://localhost:5173',
    },
  },
});
