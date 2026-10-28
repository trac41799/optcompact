#!/usr/bin/env node
/**
 * Generate a Cordis patch overlay for preset-backed DeepSeek Harness profiles.
 *
 * Preset-backed profiles (web, desktop) mount an isolated `compaction` group per
 * agent preset. A host-plane insert cannot reach those groups, so this tool
 * restates each `preset-<id>` row with the policy row injected and the stock
 * backend switched to manual mode.
 *
 * Usage:
 *   dsh --profile <name> --dump-config > dump.yml
 *   node scripts/preset-override.mjs --input dump.yml --output patch.yml
 *   dsh --profile <name> --patch patch.yml --dump-config
 */

import { readFileSync, writeFileSync } from 'node:fs';

const TOP_ROW = /^- id: (.+)$/;
const GROUP_ROW = /^ {6}- id: compaction$/;
const PLUGIN_ROW = /^ {10}- id: (.+)$/;
const COMPACTION_BASIC = /^ {10}- id: compaction-basic$/;
const PLUGIN_CONFIG = /^ {12}config:$/;

export function generatePatch(text, options = {}) {
  const plugin = options.plugin ?? '@optcompact/dsh';
  const firstNode = options.firstNode ?? 1;
  const evidence = options.evidence;

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = TOP_ROW.exec(lines[i]);
    if (match) starts.push({ index: i, id: match[1].trim().replace(/^['"]|['"]$/g, '') });
  }
  if (starts.length === 0) throw new Error('no top-level rows found; is this a --dump-config output?');

  const presets = starts.filter((row) => row.id.startsWith('preset-'));
  if (presets.length === 0) throw new Error('no preset-* rows found; this profile does not mount agent presets');

  const patched = [];
  for (let p = presets.length - 1; p >= 0; p -= 1) {
    const start = presets[p].index;
    const end = p + 1 < presets.length ? presets[p + 1].index : lines.length;
    const block = lines.slice(start, end);
    const result = patchPresetBlock(block, { plugin, firstNode, evidence });
    lines.splice(start, end - start, ...result.lines);
    patched.push({ id: presets[p].id, changed: result.changed });
  }

  const output = [];
  for (const entry of patched.reverse()) {
    output.push(`- id: ${entry.id}`);
    const configLines = extractConfig(lines, entry.id);
    if (!configLines) throw new Error(`preset ${entry.id} has no config block`);
    output.push(...configLines, '');
  }
  return { text: output.join('\n').replace(/\n+$/, '\n'), presets: patched.length, changed: patched.filter((x) => x.changed).length };
}

function patchPresetBlock(block, options) {
  const groupStart = block.findIndex((line) => GROUP_ROW.test(line));
  if (groupStart < 0) return { lines: block, changed: false };

  let groupEnd = block.length;
  for (let i = groupStart + 1; i < block.length; i += 1) {
    if (/^ {6}- id: /.test(block[i])) {
      groupEnd = i;
      break;
    }
    if (TOP_ROW.test(block[i])) {
      groupEnd = i;
      break;
    }
  }

  const group = block.slice(groupStart, groupEnd).map((line) => line);
  const already = group.some((line) => /^ {10}- id: optcompact-policy$/.test(line));
  if (!already) {
    // Add auto:false to compaction-basic, then append the policy row.
    const basic = group.findIndex((line) => COMPACTION_BASIC.test(line));
    if (basic < 0) return { lines: block, changed: false };

    let basicEnd = group.length;
    for (let i = basic + 1; i < group.length; i += 1) {
      if (PLUGIN_ROW.test(group[i])) {
        basicEnd = i;
        break;
      }
    }
    const hasConfig = group.slice(basic, basicEnd).some((line) => PLUGIN_CONFIG.test(line));
    if (!hasConfig) {
      group.splice(basic + 2, 0, '            config:', '              auto: false');
    } else if (!group.slice(basic, basicEnd).some((line) => /^ {14}auto: false$/.test(line))) {
      const configIndex = group.findIndex((line, i) => i > basic && PLUGIN_CONFIG.test(line));
      group.splice(configIndex + 1, 0, '              auto: false');
    }

    const policy = [
      '          - id: optcompact-policy',
      `            name: '${options.plugin}'`,
      '            config:',
      `              firstCompactableNode: ${options.firstNode}`
    ];
    if (options.evidence) policy.push(`              evidencePath: '${String(options.evidence).replace(/\\/g, '/')}'`);
    group.push(...policy);
  }

  return { lines: [...block.slice(0, groupStart), ...group, ...block.slice(groupEnd)], changed: !already };
}

function extractConfig(lines, id) {
  const start = lines.findIndex((line) => line === `- id: ${id}`);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (TOP_ROW.test(lines[i])) {
      end = i;
      break;
    }
  }
  const configIndex = lines.findIndex((line, i) => i > start && i < end && line === '  config:');
  if (configIndex < 0) return null;
  return lines.slice(configIndex, end);
}

function parseArgs(argv) {
  const args = { firstNode: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--input') args.input = value;
    else if (key === '--output') args.output = value;
    else if (key === '--plugin') args.plugin = value;
    else if (key === '--evidence') args.evidence = value;
    else if (key === '--first-node') args.firstNode = Number(value);
    else continue;
    i += 1;
  }
  return args;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isMain || process.argv[1]?.endsWith('preset-override.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    console.error('usage: preset-override.mjs --input <dump.yml> --output <patch.yml> [--plugin name] [--evidence path] [--first-node n]');
    process.exit(2);
  }
  try {
    const result = generatePatch(readFileSync(args.input, 'utf8'), args);
    writeFileSync(args.output, result.text, 'utf8');
    console.error(`presets=${result.presets} changed=${result.changed} output=${args.output}`);
    if (result.changed === 0) {
      console.error('warning: every preset already contains the policy row');
    }
  } catch (error) {
    console.error(`preset-override: ${error.message}`);
    process.exit(1);
  }
}
