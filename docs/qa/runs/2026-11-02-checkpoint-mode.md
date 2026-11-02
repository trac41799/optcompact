# Checkpoint mode run, 2026-11-02

**Verdict:** boundary checkpoints shrink the context by 88% per event and leave it at 8.6% of the window, while critical context survives at 99.6%. Total consumed tokens fall 36% against the fixed baseline.

## Definitions

- **Per-event reduction**: `1 - post / pre` for one checkpoint. This is the "how much did compaction remove" number.
- **Post occupancy**: context tokens after the checkpoint divided by the window.
- **Critical recall**: needs against goal, decision, error, and file units that were satisfied.
- **All-need coverage**: every latent need, including bulk tool output.
- **Total tokens**: carried + summarization + rework, consumed over the session.

The earlier 14% figure was session-total token savings against a baseline, not per-event compaction. These are different metrics.

## Setup

- 20 seeded sessions, 100 turns, 200k window.
- Critical units: goal, decisions, errors, files. Bulk units: tool output and chatter.
- Checkpoint model: trigger at 50% occupancy on a phase boundary every 25 turns, or at 75% immediately. Keep two recent turns verbatim. Write a fixed checkpoint budget. Critical survives at 0.98, bulk at 0.30.
- Fixed baseline compacts to 60% at 80% load.

## Results

| Policy | Total | All needs | Critical | Per-event | Post occ. | Compactions |
|---|---|---|---|---|---|---|
| Fixed 0.80 | 12.75M | 96.8% | 97.1% | 30% | 58.3% | 9.8 |
| Prune + compact 0.75 | 10.96M | 96.9% | 99.8% | 19% | 62.8% | 3.5 |
| **Checkpoint 50%, phase 25, tail 2, 1500** | **8.16M** | **90.6%** | **99.6%** | **88%** | **8.6%** | 4.4 |
| Checkpoint 50%, phase 20, tail 2, 1200 | 7.80M | 89.9% | 99.4% | 89% | 8.0% | 4.6 |
| Checkpoint 40%, phase 20, tail 1, 1000 | 7.40M | 89.0% | 99.3% | 94% | 4.7% | 4.5 |

## Reading

- Compaction now removes 88% of the context in one event, not 14%.
- The footprint after a checkpoint is 8.6% of the window, well under the 50% ceiling.
- Critical recall is higher than the fixed baseline: 99.6% against 97.1%.
- All-need coverage drops to 90.6% because bulk tool detail is deliberately discarded.
- Pushing the trigger to 40% and the checkpoint to 1000 tokens reaches 94% per-event reduction and 4.7% occupancy.

## Assumptions and threats

- Critical fidelity 0.98 and bulk fidelity 0.30 are assumptions. A real summarizer must be measured against them.
- The phase boundary every 25 turns is synthetic. In a real session the boundary is a new user turn.
- The checkpoint budget is enforced by the backend `maxTokens`, not by the simulator.
- Critical recall counts needs, not correctness of the next action.

## Reproduce

`node packages/sim/checkpoint-bench.ts`.
