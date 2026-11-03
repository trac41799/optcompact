#!/usr/bin/env node
/**
 * Build a self-contained ESM bundle of @optcompact/dsh for local installation
 * into a DeepSeek Harness profile.
 *
 * Output: build/optcompact-dsh/{index.js,package.json}
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const outdir = resolve('build/optcompact-dsh');
const pkg = JSON.parse(readFileSync(resolve('packages/dsh/package.json'), 'utf8'));
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: ['packages/dsh/src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: resolve(outdir, 'index.js')
});

writeFileSync(
  resolve(outdir, 'package.json'),
  `${JSON.stringify(
    {
      name: '@optcompact/dsh',
      version: pkg.version,
      type: 'module',
      main: './index.js',
      exports: { '.': './index.js' },
      engines: { dsh: '>=0.2.1-rc.2' }
    },
    null,
    2
  )}\n`,
  'utf8'
);

console.log(outdir);
