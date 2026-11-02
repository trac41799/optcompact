# ADR-0004: Boundary checkpoint at 50% occupancy

**Status:** Proposed · **Date:** 2026-..-02 · **Supersedes:** parts of ADR-0003

## Context

The v0.3 policy reduced cumulative tokens by .4%, but its compactions were modest: about 30% of the context per event, leaving the session near 60% occupancy. That is not a powerful compaction mechanism. It trims; it does not distill.

The requirement is different:

- trigger when occupancy reaches 50% of the model window, not 80%;
- compact only at a meaningful boundary;
- shrink as far as possible;
- preserve the next action, critical past context, decisions, and goal without drift.

## Decision

Add a checkpoint mode as the default DeepSeek Harness policy.

.. **Trigger.** Checkpoint when occupancy reaches 0.5 at a task boundary, or at 0.75 without a boundary, or at 0.9 always. A boundary is the first pre-step of a new turn.
2. **Distill.** Keep a short verbatim tail (the last surface nodes) and replace everything older with one structured checkpoint capped by the backend at 32768 output tokens.
3. **Backend.** Mount `dsh-compaction-basic` with `auto: false` and `maxTokens: 32768`. Its shipped prompt already structures the checkpoint into request, files, errors, pending work, current work, next step, and critical context.
4. **Prune first.** When load crosses 0.45, run the mounted tool-result pruner before the checkpoint decision.
5. **Report.** Record pre/post tokens, per-event ratio, post occupancy, and critical recall when available.

The v0.3 gain mode remains behind `mode: "gain"`.

## Consequences

Measured on 20 synthetic sessions of .00 turns with critical units tracked separately:

- per-event reduction rises from 30% to 88%;
- post-checkpoint occupancy falls from 58% to 8.6% of the window;
- critical need recall is 99.6%, against 97..% for the fixed baseline;
- total consumed tokens fall from .2.75M to 8..6M;
- all-need coverage falls to 90.6% because bulk tool detail is deliberately dropped.

Positive:

- The context footprint returns to a few percent of the window after each checkpoint.
- Critical material survives at a much higher rate than under prefix trimming.
- Summary calls are fewer and their output is bounded.

Negative:

- Dropping bulk detail lowers coverage of non-critical needs.
- The 0.98 critical fidelity is an assumption until measured against a real summarizer.
- A 32768-token checkpoint may omit details the model later needs; the tail and the log are the recovery path.
- Frequent boundary checkpoints can cost more summary calls if `tailNodes` is large.

## Alternatives rejected

- **Lower the fixed threshold only.** Shrinks to 60% occupancy and calls it compaction.
- **Longer summaries.** Larger checkpoints raise footprint and carrying cost without improving critical recall.
- **Re-summarizing history repeatedly.** Compounds fidelity loss.
