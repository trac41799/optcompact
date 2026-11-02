import { generateSession, simulatePolicy } from './src/index.ts';
const sessions = Array.from({ length: 20 }, (_, i) => generateSession({ seed: i + 1, turns: 100, windowTokens: 200000, startTokens: 4000, outputTokensPerTurn: 250 }));
function run(label, policy, options = {}) {
  let total=0, sum=0, rework=0, sat=0, needs=0, comp=0, ratio=0, post=0, cn=0, cs=0;
  for (const s of sessions) { const r=simulatePolicy(s,policy,options); total+=r.totalTokens; sum+=r.summaryTokens; rework+=r.reworkTokens; sat+=r.satisfied; needs+=r.needs; comp+=r.compactions; ratio+=r.avgCompactionRatio; post+=r.avgPostOccupancy; cn+=r.criticalNeeds; cs+=r.criticalSatisfied; }
  const n=sessions.length;
  console.log(`${label.padEnd(34)} | ${(total/n/1e6).toFixed(2).padStart(5)}M | ${((sat/needs)*100).toFixed(1).padStart(5)}% | ${((cs/cn)*100).toFixed(1).padStart(5)}% | ${((ratio/n)*100).toFixed(0).padStart(3)}% | ${((post/n)*100).toFixed(1).padStart(4)}% | ${(comp/n).toFixed(1)}`);
}
console.log('policy                             | total | all   | crit  | ratio | post | comp');
run('fixed 0.80','fixed',{fixedLoad:0.8,retentionRatio:0.16,targetLoad:0.6});
run('prune + compact 0.75 t0.6','prune',{fixedLoad:0.75,targetLoad:0.6,retentionRatio:0.16,pruneAge:6,pruneScale:0.15,pruneMinTokens:3000,pruneLoad:0.45});
run('checkpoint 50% phase25 tail2 1500','checkpoint',{phaseTurns:25,tailTurns:2,checkpointTokens:1500});
run('checkpoint 50% phase20 tail2 1200','checkpoint',{phaseTurns:20,tailTurns:2,checkpointTokens:1200});
run('checkpoint 40% phase20 tail1 1000','checkpoint',{phaseTurns:20,tailTurns:1,checkpointTokens:1000});