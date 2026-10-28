/**
 * Retention measurement: anchor extraction and the anchor retention score.
 *
 * @module
 */
import type { Anchor, Decision } from './types.ts';

interface Pattern {
  kind: Anchor['kind'];
  weight: number;
  regex: RegExp;
}

const EXTENSIONS =
  'ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|rb|php|cs|cpp|cc|c|h|hpp|md|json|jsonc|ya?ml|toml|sql|sh|ps1|html|css|scss|txt';

const PATTERNS: readonly Pattern[] = [
  {
    kind: 'path',
    weight: 2,
    regex: new RegExp(`(?:[A-Za-z]:)?(?:[\\\\/])?(?:[\\w@.-]+[\\\\/])*[\\w@.-]+\\.(?:${EXTENSIONS})\\b`, 'g')
  },
  {
    kind: 'error',
    weight: 3,
    regex: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b|\bE[A-Z]{3,}\b/g
  },
  {
    kind: 'symbol',
    weight: 1.5,
    regex: /\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g
  },
  {
    kind: 'number',
    weight: 1,
    regex: /\b\d[\d,]*(?:\.\d+)?\s?(?:%|ms|s|tokens?|turns?|kb|mb|gb|k|m)\b/gi
  }
];

/**
 * Extract weighted anchors from text.
 * Results are deduplicated case-insensitively, keeping the strongest weight.
 */
export function extractAnchors(text: string): Anchor[] {
  const found = new Map<string, Anchor>();
  for (const pattern of PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`);
    for (const match of text.matchAll(regex)) {
      const raw = match[0].trim();
      if (raw.length < 3) continue;
      const key = raw.toLowerCase();
      const existing = found.get(key);
      if (!existing || existing.weight < pattern.weight) {
        found.set(key, { text: raw, kind: pattern.kind, weight: pattern.weight });
      }
    }
  }
  return [...found.values()].sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text));
}

/**
 * Weighted fraction of anchors present in the post-compaction text.
 * Returns one when there is nothing to lose.
 */
export function anchorRetentionScore(anchors: readonly Anchor[], postCompactionText: string): number {
  const total = anchors.reduce((sum, anchor) => sum + anchor.weight, 0);
  if (total <= 0) return 1;
  const haystack = postCompactionText.toLowerCase();
  let hit = 0;
  for (const anchor of anchors) {
    if (haystack.includes(anchor.text.toLowerCase())) hit += anchor.weight;
  }
  return hit / total;
}

/** Compaction efficiency ratio of one decision, tokens saved per unit of cost. */
export function decisionCer(decision: Decision): number {
  return decision.cer;
}
