import { defaultParams } from '@optcompact/core';
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

function run(label: string, params: Partial<ReturnType<typeof defaultParams>> = {}) {
  let tokens = 0;
  let satisfied = 0;
  let needs = 0;
  let lost = 0;
  let compactions = 0;
  for (const session of sessions) {
    const r = simulatePolicy(session, 'hazard', { params });
    tokens += r.tokensSpent;
    satisfied += r.satisfied;
    needs += r.needs;
    lost += r.lost;
    compactions += r.compactions;
  }
  const n = sessions.length;
  console.log(
    `${label.padEnd(22)} | ${(tokens / n / 1e6).toFixed(2).padStart(6)}M | ${((satisfied / needs) * 100).toFixed(2).padStart(6)}% | ${(lost / n).toFixed(1).padStart(5)} | ${(compactions / n).toFixed(1).padStart(4)}`
  );
}

console.log('variant                | tokens | satisfied | lost  | comp');
for (const lambda of [1, 3, 10, 30, 100]) run(`lossAversion=${lambda}`, { lossAversion: lambda });
for (const floor of [0.5, 0.7, 0.85, 0.95]) run(`qualityFloor=${floor}`, { qualityFloor: floor });
