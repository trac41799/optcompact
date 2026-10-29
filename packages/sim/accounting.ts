import { generateSession, simulatePolicy } from './src/index.ts';
const sessions = Array.from({ length: 20 }, (_, i) => generateSession({ seed: i + 1, turns: 100, windowTokens: 200000, startTokens: 4000, outputTokensPerTurn: 250 }));
function run(label, policy, options = {}) {
  let carried=0, summary=0, rework=0, total=0, sat=0, needs=0, comp=0;
  for (const s of sessions) { const r=simulatePolicy(s,policy,options); carried+=r.tokensSpent; summary+=r.summaryTokens; rework+=r.reworkTokens; total+=r.totalTokens; sat+=r.satisfied; needs+=r.needs; comp+=r.compactions; }
  const n=sessions.length;
  console.log(`${label.padEnd(40)} | ${(carried/n/1e6).toFixed(2).padStart(6)} | ${(summary/n/1e6).toFixed(2).padStart(6)} | ${(rework/n/1e6).toFixed(3).padStart(5)} | ${(total/n/1e6).toFixed(2).padStart(6)} | ${((sat/needs)*100).toFixed(2).padStart(6)}% | ${(comp/n).toFixed(1)}`);
}
console.log('policy                                   | carryM | summM  | rewk  | totalM | cover  | comp');
run('never compact','never');
run('fixed 0.80 rho0.16 t0.6','fixed',{fixedLoad:0.8,retentionRatio:0.16,targetLoad:0.6});
run('hazard defaults','hazard');
run('planned q=0.95','planned',{qualityTarget:0.95});
run('planned q=0.99','planned',{qualityTarget:0.99});
run('prune age12 s0.2 load0.8 t0.6','prune',{fixedLoad:0.8,targetLoad:0.6,retentionRatio:0.16,pruneAge:12,pruneScale:0.2,pruneMinTokens:3000,pruneLoad:0.45});
run('prune age6 s0.15 load0.75 t0.6','prune',{fixedLoad:0.75,targetLoad:0.6,retentionRatio:0.16,pruneAge:6,pruneScale:0.15,pruneMinTokens:3000,pruneLoad:0.45});
run('prune age6 s0.15 load0.75 t0.55','prune',{fixedLoad:0.75,targetLoad:0.55,retentionRatio:0.16,pruneAge:6,pruneScale:0.15,pruneMinTokens:3000,pruneLoad:0.45});