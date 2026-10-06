import { build } from 'esbuild';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const directory = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(await readFile(new URL('package.json', import.meta.url), 'utf8'));
const plugin = {
  name: 'workspace-source',
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, async (args) => {
      if (args.path === '@skillshare/contracts')
        return { path: path.join(root, 'packages/contracts/src/index.ts'), namespace: 'workspace' };
      if (args.kind !== 'entry-point' && !args.path.startsWith('.') && !path.isAbsolute(args.path))
        return { path: args.path, external: true };
      const target = path.resolve(
        args.importer ? path.dirname(args.importer) : process.cwd(),
        args.path,
      );
      for (const candidate of [target, target.replace(/\.js$/, '.ts')])
        if (
          await stat(candidate)
            .then((s) => s.isFile())
            .catch(() => false)
        )
          return { path: candidate, namespace: 'workspace' };
      throw new Error('Missing build input ' + target);
    });
    builder.onLoad({ filter: /.*/, namespace: 'workspace' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: args.path.endsWith('.ts') ? 'ts' : 'js',
      resolveDir: path.dirname(args.path),
    }));
  },
};
await build({
  entryPoints: [path.join(directory, 'src/bin.ts')],
  outfile: path.join(directory, 'dist/bin.js'),
  define: { CLI_VERSION: JSON.stringify(pkg.version) },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@napi-rs/keyring'],
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: true,
  plugins: [plugin],
});
