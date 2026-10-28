import { generateSession, simulatePolicy, type SimConfig } from './src/index.ts';

const config: SimConfig = {
  seed: 1,
  turns: 100,
  windowTokens: 200_000,
  startTokens: 4_000,
  outputTokensPerTurn: 250
};
const sessions = Array.from({ length: 20 }, (_, i) => generateSession({ ...config, seed: i + 1 }));

interface Row {
  label: string;
  tokens: number;
  coverage: number;
  compactions: number;
}

function run(label: string, policy: 'fixed' | 'planned' | 'hazard', options: Record<string, number>): Row {
  let tokens = 0, satisfied = 0, needs = 0, compactions = 0;
  for (const session of sessions) {
    const r = simulatePolicy(session, policy, options);
    tokens += r.tokensSpent;
    satisfied += r.satisfied;
    needs += r.needs;
    compactions += r.compactions;
  }
  const n = sessions.length;
  return { label, tokens: tokens / n, coverage: satisfied / needs, compactions: compactions / n };
}

const rows: Row[] = [];
rows.push(run('fixed load=0.80 rho=0.16 target=0.60', 'fixed', { fixedLoad: 0.8, retentionRatio: 0.16, targetLoad: 0.6 }));
for (const load of [0.6, 0.7, 0.85, 0.9, 0.95]) {
  for (const rho of [0.1, 0.16, 0.25, 0.35]) {
    for (const target of [0.4, 0.6, 0.75]) {
      rows.push(run(`fixed load=${load} rho=${rho} target=${target}`, 'fixed', { fixedLoad: load, retentionRatio: rho, targetLoad: target }));
    }
  }
}
for (const q of [0.9, 0.95, 0.97, 0.99]) {
  for (const rho of [0.16, 0.25, 0.35]) {
    rows.push(run(`planned q=${q} rho=${rho}`, 'planned', { qualityTarget: q, retentionRatio: rho }));
  }
}
rows.push(run('hazard defaults', 'hazard', {}));

rows.sort((a, b) => a.tokens - b.tokens);
console.log('label                                        | tokens(M) | coverage | comp');
for (const row of rows.slice(0, 30)) {
  console.log(
    `${row.label.padEnd(44)} | ${(row.tokens / 1e6).toFixed(2).padStart(9)} | ${(row.coverage * 100).toFixed(2).padStart(7)}% | ${row.compactions.toFixed(1).padStart(4)}`
  );
}

const baseline = rows.find((r) => r.label.startsWith('fixed load=0.80 rho=0.16'))!;
const better = rows.filter((r) => r.tokens < baseline.tokens && r.coverage >= baseline.coverage);
console.log(`\nbaseline tokens=${(baseline.tokens / 1e6).toFixed(2)}M coverage=${(baseline.coverage * 100).toFixed(2)}%`);
console.log(`points beating baseline at equal or better coverage: ${better.length}`);
for (const row of better.slice(0, 8)) {
  console.log(`  ${row.label} -> ${(row.tokens / 1e6).toFixed(2)}M / ${(row.coverage * 100).toFixed(2)}%`);
}
