import { generateSession, simulatePolicy } from './src/index.ts';
const sessions = Array.from({ length: 20 }, (_, i) => generateSession({ seed: i + 1, turns: 100, windowTokens: 200000, startTokens: 4000, outputTokensPerTurn: 250 }));
function run(options) {
  let t = 0, sat = 0, needs = 0, comp = 0;
  for (const s of sessions) { const r = simulatePolicy(s, 'prune', options); t += r.tokensSpent; sat += r.satisfied; needs += r.needs; comp += r.compactions; }
  const n = sessions.length;
  return { tokens: t / n, coverage: sat / needs, compactions: comp / n };
}
const rows = [];
for (const pruneAge of [8, 10, 12]) for (const fixedLoad of [0.8, 0.85, 0.9]) for (const targetLoad of [0.5, 0.6]) {
  const r = run({ fixedLoad, targetLoad, retentionRatio: 0.16, pruneScale: 0.2, pruneAge, pruneMinTokens: 3000, pruneLoad: 0.45 });
  rows.push({ label: `age=${pruneAge} compact=${fixedLoad} target=${targetLoad}`, ...r });
}
rows.sort((a,b) => a.tokens - b.tokens);
for (const r of rows) console.log(`${r.label.padEnd(34)} ${(r.tokens/1e6).toFixed(2)}M ${(r.coverage*100).toFixed(2)}% comp ${r.compactions.toFixed(1)}`);