import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generatePatch } from './preset-override.mjs';

const fixture = `- id: preset-alpha
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: alpha
    order: 1
    plugins:
      - id: tool-fs
        name: '@deepseek-ai/dsh-tool-fs'
      - id: compaction
        name: cordis:group
        group: true
        isolate:
          compaction: true
        config:
          - id: compaction-basic
            name: '@deepseek-ai/dsh-compaction-basic'
          - id: command-compact
            name: '@deepseek-ai/dsh-command-compact'
      - id: delegation
        name: cordis:group
        group: true
        disabled: !!js process.platform === 'win32'
        config:
          - id: x
            name: x

- id: preset-beta
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: beta
    order: 2
    plugins:
      - id: compaction
        name: cordis:group
        group: true
        isolate:
          compaction: true
        config:
          - id: compaction-basic
            name: '@deepseek-ai/dsh-compaction-basic'
`;

test('injects the policy row into every preset compaction group', () => {
  const result = generatePatch(fixture);
  assert.equal(result.presets, 2);
  assert.equal(result.changed, 2);
  assert.equal((result.text.match(/- id: optcompact-policy/g) ?? []).length, 2);
  assert.equal((result.text.match(/auto: false/g) ?? []).length, 2);
  assert.match(result.text, /- id: preset-alpha/);
  assert.match(result.text, /- id: preset-beta/);
});

test('keeps the policy row inside the compaction group', () => {
  const result = generatePatch(fixture);
  const alpha = result.text.split('- id: preset-beta')[0] ?? '';
  const start = alpha.indexOf('      - id: compaction\n');
  const end = alpha.indexOf('      - id: delegation', start);
  const group = alpha.slice(start, end === -1 ? undefined : end);
  assert.match(group, /- id: optcompact-policy/);
  assert.match(group, /auto: false/);
});

test('preserves !!js scalars', () => {
  const result = generatePatch(fixture);
  assert.match(result.text, /!!js process\.platform === 'win32'/);
});

test('is idempotent when the policy row already exists', () => {
  const patchedDump = `- id: preset-alpha
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: alpha
    order: 1
    plugins:
      - id: compaction
        name: cordis:group
        group: true
        isolate:
          compaction: true
        config:
          - id: compaction-basic
            name: '@deepseek-ai/dsh-compaction-basic'
            config:
              auto: false
          - id: optcompact-policy
            name: '@optcompact/dsh'
            config:
              firstCompactableNode: 1
`;
  const result = generatePatch(patchedDump);
  assert.equal(result.changed, 0);
  assert.equal((result.text.match(/- id: optcompact-policy/g) ?? []).length, 1);
});

test('rejects a dump without presets', () => {
  assert.throws(() => generatePatch("- id: tool-fs\n  name: x\n"), /no preset-/);
});
