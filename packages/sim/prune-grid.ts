import { generateSession, simulatePolicy } from './src/index.ts';
const sessions = Array.from({ length: 20 }, (_, i) => generateSession({ seed: i + 1, turns: 100, windowTokens: 200000, startTokens: 4000, outputTokensPerTurn: 250 }));
function run(options) {
  let t = 0, sat = 0, needs = 0, comp = 0;
  for (const s of sessions) { const r = simulatePolicy(s, 'prune', options); t += r.tokensSpent; sat += r.satisfied; needs += r.needs; comp += r.compactions; }
  const n = sessions.length;
  return { tokens: t / n, coverage: sat / needs, compactions: comp / n };
}
const base = run({ fixedLoad: 0.8, retentionRatio: 0.16, targetLoad: 0.6 });
console.log(`baseline ${(base.tokens/1e6).toFixed(2)}M ${(base.coverage*100).toFixed(2)}%`);
const rows = [];
for (const pruneScale of [0.2, 0.35, 0.5]) for (const pruneAge of [2, 5, 8]) for (const pruneMinTokens of [3000, 8000]) for (const pruneLoad of [0.45, 0.6]) {
  const r = run({ fixedLoad: 0.8, retentionRatio: 0.16, targetLoad: 0.6, pruneScale, pruneAge, pruneMinTokens, pruneLoad });
  rows.push({ label: `scale=${pruneScale} age=${pruneAge} min=${pruneMinTokens} load=${pruneLoad}`, ...r });
}
rows.sort((a,b) => a.tokens - b.tokens);
for (const r of rows.slice(0, 12)) console.log(`${r.label.padEnd(44)} ${(r.tokens/1e6).toFixed(2)}M ${(r.coverage*100).toFixed(2)}% comp ${r.compactions.toFixed(1)}`);
const better = rows.filter(r => r.tokens < base.tokens && r.coverage >= base.coverage);
console.log('better than baseline:', better.length);
for (const r of better.slice(0,5)) console.log(' ', r.label, (r.tokens/1e6).toFixed(2), (r.coverage*100).toFixed(2));