#!/usr/bin/env node
/**
 * Verify that every relative markdown link resolves to a file in the repo.
 * Ignores anchors, external URLs, and mail links.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const SKIP = new Set(['node_modules', '.git', 'dist', 'coverage']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const failures = [];
for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (!target || target.startsWith('http') || target.startsWith('mailto:') || target.startsWith('#')) continue;
    const clean = target.split('#')[0];
    if (!clean) continue;
    const full = clean.startsWith('/') ? join(ROOT, clean) : resolve(dirname(file), clean);
    try {
      statSync(full);
    } catch {
      failures.push(`${file.replace(ROOT, '.')}: ${target}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Broken relative links (${failures.length}):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('All relative documentation links resolve.');
