# ADR-0001: Hazard-rate value model with rate-distortion fidelity

**Status:** Proposed · **Date:** 2026-10-29 · **Supersedes:** none

## Context

Coding harnesses compact at fixed token pressure: DeepSeek Harness defaults to 0.8 of the window, and Codex exposes a fixed auto-compact limit. A fixed threshold ignores the price of tokens, the value of the shadowed material, the cost of the summary call, and the fidelity of the summarizer. Two sessions at identical load can therefore have opposite optimal decisions.

Candidate approaches:

1. **Fixed pressure ratio.** Simple, predictable, and blind to information value.
2. **Periodic compaction.** Blind to bursty tool output and to task phase.
3. **LLM-graded importance per turn.** Accurate, but adds a model call and latency on every turn.
4. **Reuse-hazard value model plus rate-distortion fidelity.** Computable from observed identifiers and prices, explainable, and free of network calls.
5. **Learned policy.** Needs labelled trajectories that do not exist yet, and is hard to audit.

## Decision

Adopt option 4, specified in [`docs/specs/compaction-model.md`](../specs/compaction-model.md).

Each context unit carries a reuse hazard `h_i(t) = a_θ exp(−(t−r_i)/τ)` and a token-denominated re-derivation cost `w_i`. The engine compares the carrying cost of a unit with the expected cost of losing it, sums the per-unit gains over the oldest prefix, and compacts when the best prefix has positive gain. Summary fidelity follows a Weibull distortion curve in the retention ratio `ρ`, penalized by compaction generation. A renewal-reward derivation supplies the economic interval `T* = sqrt(2c_0/(λρg))` as a sanity bound and as the fallback when value signals are absent.

The model is fully deterministic and dependency-free. Every decision reports its terms in token-equivalents, so a user can audit it.

## Consequences

Positive:

- Decisions respond to price, growth, span size, and summarizer behavior.
- No extra model call on the decision path.
- Every parameter has a calibration hook, so the model can improve without a redesign.
- The fixed-threshold policy remains available as a baseline for evaluation.

Negative:

- The exponential hazard is an assumption. Sessions that revisit an old subsystem violate it.
- Lexical identifier recurrence misses paraphrase reuse.
- Fidelity parameters must be calibrated per summarizer model.
- The model adds configuration surface compared with one threshold.

Mitigations:

- Calibrate `τ`, `a_θ`, and the fidelity curve from session logs and anchor-retention experiments.
- Keep the threshold backend selectable, and compare policies in the simulator.
- Revisit the hazard shape if replay evidence rejects the exponential fit.

## Alternatives rejected

- **LLM-graded importance** doubles the calls on the decision path and makes decisions nondeterministic.
- **Learned policy** lacks training data and auditability at this stage.
