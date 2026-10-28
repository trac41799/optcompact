import { generateSession, simulatePolicy } from './src/index.ts';
const sessions = Array.from({ length: 20 }, (_, i) => generateSession({ seed: i + 1, turns: 100, windowTokens: 200000, startTokens: 4000, outputTokensPerTurn: 250 }));
function run(label, policy, options) {
  let t = 0, sat = 0, needs = 0, comp = 0, ov = 0;
  for (const s of sessions) { const r = simulatePolicy(s, policy, options); t += r.tokensSpent; sat += r.satisfied; needs += r.needs; comp += r.compactions; ov += r.overflowTurns; }
  const n = sessions.length;
  console.log(`${label.padEnd(30)} | ${(t/n/1e6).toFixed(2)}M | ${((sat/needs)*100).toFixed(2)}% | comp ${(comp/n).toFixed(1)} | ov ${ov}`);
}
run('fixed 0.80', 'fixed', { fixedLoad: 0.8, retentionRatio: 0.16, targetLoad: 0.6 });
run('prune + compact 0.80', 'prune', { fixedLoad: 0.8, retentionRatio: 0.16, targetLoad: 0.6 });
run('prune + compact 0.90', 'prune', { fixedLoad: 0.9, retentionRatio: 0.16, targetLoad: 0.7 });