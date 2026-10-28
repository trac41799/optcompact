import { defaultParams, planSchedule } from '@optcompact/core';
import { generateSession, simulatePolicy, type SimConfig } from './src/index.ts';

const config: SimConfig = {
  seed: 1,
  turns: 100,
  windowTokens: 200_000,
  startTokens: 4_000,
  outputTokensPerTurn: 250
};
const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
const sessions = seeds.map((seed) => generateSession({ ...config, seed }));
const params = defaultParams();

function run(label: string, policy: 'planned' | 'hazard' | 'fixed', qualityTarget?: number) {
  let tokens = 0, satisfied = 0, needs = 0, lost = 0, compactions = 0;
  for (const session of sessions) {
    const r = simulatePolicy(session, policy, { qualityTarget });
    tokens += r.tokensSpent;
    satisfied += r.satisfied;
    needs += r.needs;
    lost += r.lost;
    compactions += r.compactions;
  }
  const n = sessions.length;
  console.log(
    `${label.padEnd(26)} | ${(tokens / n / 1e6).toFixed(2).padStart(6)}M | ${((satisfied / needs) * 100).toFixed(2).padStart(6)}% | ${(lost / n).toFixed(1).padStart(5)} | ${(compactions / n).toFixed(1).padStart(5)}`
  );
}

console.log('policy                     | tokens | satisfied | lost  | comp');
run('fixed 0.80', 'fixed');
run('hazard defaults', 'hazard');
for (const target of [0.80, 0.85, 0.90, 0.95, 0.99]) {
  const plan = planSchedule({
    horizonTurns: config.turns,
    growthPerTurn: 6_000,
    windowTokens: config.windowTokens,
    outputReserveTokens: 8_000,
    prices: { input: 1, output: 4, fixedCallCost: 20_000 },
    params,
    qualityTarget: target
  });
  run(
    `planned q=${target.toFixed(2)} T=${plan.intervalTurns}`,
    'planned',
    target
  );
  console.log(
    `${''.padEnd(26)}   predicted quality ${plan.expectedQuality.toFixed(3)}, compactions ${plan.compactions}, tokens ${(plan.expectedTokens / 1e6).toFixed(2)}M`
  );
}
