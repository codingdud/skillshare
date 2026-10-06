import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/server.ts', 'src/app.ts'],
  format: ['esm'],
  outDir: 'dist',
  noExternal: ['@skillshare/contracts'],
  // Bundled CommonJS deps (e.g. yaml via contracts) call require(), which ESM output lacks.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  clean: true,
  sourcemap: true,
});
