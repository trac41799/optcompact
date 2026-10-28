# Simulation run: policy comparison, 2026-10-29

**Command:** `node packages/sim/bench.ts` and `node packages/sim/pareto.ts`
**Commit:** pending first commit
**Verdict:** the hazard policy has a measurable frontier. The default setting is cost-first, not quality-first.

## Method

- 20 seeded sessions, 100 turns each, window 200,000 tokens.
- Units arrive each turn. Turn 1 creates the goal. Later turns add a decision or chatter unit, occasional errors, file reads, and tool results.
- Each unit carries a latent per-turn reuse hazard `a_θ exp(−(t−c)/9)` and a latent re-derivation cost.
- Policies see only the surface: unit sizes, creation turns, and last observed reference. They never see the latent hazards.
- Ground-truth fidelity is more pessimistic than the model: the ceilings are 0.45 for tool output and 0.60 for files.
- A lost need costs `costMultiplier × tokens` in rework, and counts against need coverage.
- The never-compact policy is forced to compact at 100% load and each such turn counts as an overflow.

## Results

| Policy | Tokens (M) | Need coverage | Lost needs | Rework (M) | Compactions | Overflows |
|---|---|---|---|---|---|---|
| Never compact | 13.54 | 97.38% | 2.2 | 0.01 | 5.3 | 107 |
| Fixed 0.80 | 11.93 | 96.85% | 2.6 | 0.01 | 9.8 | 0 |
| Periodic 15 | 12.94 | 96.91% | 2.6 | 0.01 | 7.7 | 63 |
| Hazard, defaults | 4.50 | 83.16% | 14.2 | 0.04 | 30.6 | 0 |
| Hazard, quality floor 0.95 | 12.16 | 95.00% | 4.2 | 0.03 | 15.2 | 0 |

Parameter sweep, hazard policy:

| Setting | Tokens (M) | Need coverage | Compactions |
|---|---|---|---|
| lossAversion 1 | 4.50 | 83.11% | 30.6 |
| lossAversion 10 | 4.57 | 83.34% | 30.6 |
| lossAversion 100 | 5.27 | 86.79% | 30.6 |
| qualityFloor 0.50 | 4.36 | 82.39% | 30.6 |
| qualityFloor 0.85 | 4.92 | 84.30% | 30.6 |
| qualityFloor 0.95 | 12.16 | 95.00% | 15.2 |

## Interpretation

- The hazard policy cuts token spend by 62% against the fixed baseline at default settings.
- That cut costs 13.7 points of need coverage. The model is not Pareto-dominant; it exposes a frontier.
- A quality floor of 0.95 recovers coverage to 95% but spends slightly more than the fixed baseline.
- Compaction count stays high under the default, even as quality falls. The checkpoint guard delays folding but does not stop new-material compaction.
- The economic interval and the quality guard act on different scales. Tokens are saved per turn. Quality is lost per operation.

## Threats to validity

- Need coverage is not task success. A lost file detail may be cheap; a lost constraint may fail the task. The rework term does not capture task-level failure.
- The generator is synthetic. Real sessions have burstier tool output and longer reuse tails.
- The ground-truth fidelity curve is assumed, not measured.
- The policy sees perfect last-reference turns, which a real adapter estimates from text.
- Compaction cost excludes prompt-cache effects.

## Next gates

1. Replay real session logs with the same metrics.
2. Add a task-level success proxy based on anchor retention.
3. Calibrate the fidelity curve from a summarizer study.
