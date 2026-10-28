import { generateSession, simulatePolicy } from './src/index.ts';
const sessions = Array.from({ length: 20 }, (_, i) => generateSession({ seed: i + 1, turns: 100, windowTokens: 200000, startTokens: 4000, outputTokensPerTurn: 250 }));
function run(o) { let t=0,sat=0,needs=0,comp=0; for (const s of sessions) { const r=simulatePolicy(s,'prune',o); t+=r.tokensSpent; sat+=r.satisfied; needs+=r.needs; comp+=r.compactions; } const n=sessions.length; return {tokens:t/n, coverage:sat/needs, compactions:comp/n}; }
const rows=[];
for (const pruneAge of [6,7,8,9,10,11,12]) for (const pruneScale of [0.15,0.2,0.25]) for (const fixedLoad of [0.75,0.8,0.85]) for (const targetLoad of [0.55,0.6,0.65]) {
  const r=run({fixedLoad,targetLoad,retentionRatio:0.16,pruneScale,pruneAge,pruneMinTokens:3000,pruneLoad:0.45});
  rows.push({label:`age=${pruneAge} scale=${pruneScale} load=${fixedLoad} target=${targetLoad}`,...r});
}
rows.sort((a,b)=>a.tokens-b.tokens);
const good=rows.filter(r=>r.coverage>=0.9685);
console.log('best at >=96.85% coverage:', good.length);
for (const r of good.slice(0,8)) console.log(`${r.label.padEnd(46)} ${(r.tokens/1e6).toFixed(3)}M ${(r.coverage*100).toFixed(2)}% comp ${r.compactions.toFixed(1)}`);
console.log('--- lowest tokens overall (any coverage >= 95%) ---');
for (const r of rows.filter(r=>r.coverage>=0.95).slice(0,5)) console.log(`${r.label.padEnd(46)} ${(r.tokens/1e6).toFixed(3)}M ${(r.coverage*100).toFixed(2)}%`);