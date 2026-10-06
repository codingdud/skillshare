import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  outDir: 'dist',
  noExternal: ['@skillshare/contracts'],
  clean: true,
  sourcemap: true,
});
