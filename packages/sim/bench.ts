import { generateSession, runComparison, type SimConfig, type SimResult } from './src/index.ts';

const config: SimConfig = {
  seed: 1,
  turns: 100,
  windowTokens: 200_000,
  startTokens: 4_000,
  outputTokensPerTurn: 250
};

const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
const policies = ['never', 'fixed', 'periodic', 'hazard'] as const;
const totals = new Map<string, SimResult>(policies.map((p) => [p, {
  policy: p, tokensSpent: 0, reworkTokens: 0, needs: 0, satisfied: 0, lost: 0,
  compactions: 0, overflowTurns: 0, maxContextTokens: 0, avgContextTokens: 0, finalContextTokens: 0
}]));

for (const seed of seeds) {
  const session = generateSession({ ...config, seed });
  for (const result of runComparison(session)) {
    const acc = totals.get(result.policy)!;
    acc.tokensSpent += result.tokensSpent;
    acc.reworkTokens += result.reworkTokens;
    acc.needs += result.needs;
    acc.satisfied += result.satisfied;
    acc.lost += result.lost;
    acc.compactions += result.compactions;
    acc.overflowTurns += result.overflowTurns;
    acc.maxContextTokens += result.maxContextTokens;
    acc.avgContextTokens += result.avgContextTokens;
    acc.finalContextTokens += result.finalContextTokens;
  }
}

console.log('policy   | tokens(M) | tokens/need | satisfied | lost  | rework(M) | compactions | overflows');
console.log('---------|-----------|-------------|-----------|-------|-----------|-------------|----------');
for (const policy of policies) {
  const r = totals.get(policy)!;
  const n = seeds.length;
  const tok = r.tokensSpent / n;
  const sat = (r.satisfied / r.needs) * 100;
  const rework = r.reworkTokens / n;
  console.log(
    `${policy.padEnd(8)} | ${(tok / 1e6).toFixed(2).padStart(9)} | ${(tok / (r.needs / n)).toFixed(0).padStart(11)} | ${sat.toFixed(2).padStart(8)}% | ${(r.lost / n).toFixed(1).padStart(5)} | ${(rework / 1e6).toFixed(2).padStart(9)} | ${(r.compactions / n).toFixed(1).padStart(11)} | ${r.overflowTurns}`
  );
}
