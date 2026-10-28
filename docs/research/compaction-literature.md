# Compaction Literature: Evidence for an Optimal-Compaction-Time Model

## Conclusion (BLUF)

No published work gives a fitted, parametric curve for "quality lost per compaction at token count T".
The usable evidence is a set of monotone degradation results, a small number of measured
compression-ratio points, and several deployed threshold policies.
Deployed thresholds cluster at 70–100% of the context window, with one production default at 96.7%.
Summarization fidelity is the binding constraint, not token reduction: LLM summaries retain at most
16.0% of recurring details where mechanical extraction retains 79.1% ([Compact-Bench](https://arxiv.org/abs/2610.31710)).
Three framings carry the modelling load: renewal-reward (EOQ) for *when*, rate–distortion for *how much*,
and budgeted submodular selection for *what to keep*.

## Scope

This note collects primary sources for a model that decides *when* a coding-agent session compacts.
It covers context degradation, prompt-compression tradeoffs, deployed agent memory policies,
theory toolboxes, and coding-agent measurements.

In scope: published papers, official product documentation, and vendor engineering posts.
Out of scope: unpublished internal benchmarks, vendor marketing claims without a method section.

Confidence labels used below:

- **measured** — a number stated in the cited source.
- **derived** — arithmetic on measured numbers, shown inline.
- **unverified** — plausible but not confirmed from a primary source in this pass.

## Quantitative anchors

| Quantity | Value | Source |
|---|---|---|
| Degradation with perfect retrieval, 5 LLMs, math/QA/code | 13.9%–85% drop as input grows | [Du et al. 2025](https://arxiv.org/abs/2510.05381) |
| Models with satisfactory long-context performance at 32K | about half of 17 tested | [RULER](https://arxiv.org/abs/2404.06654) |
| GPT-3.5-Turbo accuracy, no documents (closed book) | 56.1% | [Liu et al. 2023](https://arxiv.org/abs/2307.03172) |
| GPT-3.5-Turbo accuracy, answer document in the middle | below 56.1% | [Liu et al. 2023](https://arxiv.org/abs/2307.03172) |
| Gain from 20 to 50 retrieved documents | about +1.5% (GPT-3.5), +1% (Claude-1.3) | [Liu et al. 2023](https://arxiv.org/abs/2307.03172) |
| Best-minus-worst position gap, Flan-UL2 inside its 2048-token window | 1.9 points | [Liu et al. 2023](https://arxiv.org/abs/2307.03172) |
| Worst-case key-value retrieval accuracy at 300 pairs | 45.6% | [Liu et al. 2023](https://arxiv.org/abs/2307.03172) |
| Position effect in Chroma NIAH, 11 positions | no notable variation | [Chroma 2025](https://research.trychroma.com/context-rot) |
| Chroma evaluation scale | 18 models, 8 lengths, 11 positions, 194,480 calls | [Chroma 2025](https://research.trychroma.com/context-rot) |
| LongMemEval full prompt vs focused prompt | about 113k tokens vs about 300 tokens | [Chroma 2025](https://research.trychroma.com/context-rot) |
| LLMLingua maximum compression with little loss | 20x | [Jiang et al. 2023](https://arxiv.org/abs/2310.05736) |
| LongLLMLingua, NaturalQuestions, about 4x fewer tokens | +21.4% accuracy | [Jiang et al. 2023](https://arxiv.org/abs/2310.06839) |
| LongLLMLingua cost reduction, LooGLE | 94.0% | [Jiang et al. 2023](https://arxiv.org/abs/2310.06839) |
| LLMLingua-2 working compression range | 2x–5x | [Pan et al. 2024](https://arxiv.org/abs/2403.12968) |
| Gist tokens maximum compression | 26x, 40% FLOPs cut | [Mu et al. 2023](https://arxiv.org/abs/2304.08467) |
| ICAE compression with about 1% extra parameters | 4x | [Ge et al. 2023](https://arxiv.org/abs/2307.06945) |
| AutoCompressor training sequence length | 30,720 tokens | [Chevalier et al. 2023](https://arxiv.org/abs/2305.14788) |
| MemGPT memory-pressure warning | about 70% of window | [Packer et al. 2023](https://arxiv.org/abs/2310.08560) |
| MemGPT queue flush | 100% of window, evict about 50% | [Packer et al. 2023](https://arxiv.org/abs/2310.08560) |
| MemGPT deep memory retrieval, GPT-4 | 32.1% to 92.5% | [Packer et al. 2023](https://arxiv.org/abs/2310.08560) |
| Claude Code default auto-compact, Haiku 5.5 (1M window) | about 967K tokens (96.7%) | [Claude Code docs](https://code.claude.com/docs/en/model-config.md) |
| Claude Code configurable auto-compact range | 100K–1M tokens | [Claude Code docs](https://code.claude.com/docs/en/model-config.md) |
| Claude Code files re-read after compaction | up to 5, most recent first | [Claude Code docs](https://code.claude.com/docs/en/context-window.md) |
| Claude Code file content cap after compaction | 5,000 tokens, then path reference only | [Claude Code docs](https://code.claude.com/docs/en/context-window.md) |
| Claude Code skill re-injection caps | 5,000 per skill, 25,000 total | [Claude Code docs](https://code.claude.com/docs/en/context-window.md) |
| OpenAI compaction threshold, documented example | 200,000 tokens | [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction.md) |
| Subagent return size in Anthropic guidance | about 1,000–2,000 tokens | [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| Deployed compaction damage, 14 summarizers | 5%–64% of 22 full-history successes | [Compact-Bench](https://arxiv.org/abs/2610.31710) |
| Recurring-detail retention, LLM summary vs mechanical | 16.0% vs 79.1% | [Compact-Bench](https://arxiv.org/abs/2610.31710) |
| Recurring-detail retention, production summaries at first boundary | 15.7% | [Compact-Bench](https://arxiv.org/abs/2610.31710) |
| Best task-continuation rate by prompt, Kimi-K3 summarizer | 19 of 22 | [Compact-Bench](https://arxiv.org/abs/2610.31710) |
| AutoCompact pass-rate gain | +9.2% SWE-bench Verified, +5.0% SWE-PolyBench Verified | [Zhang et al. 2026](https://arxiv.org/abs/2610.02163) |
| SWE-Compressor solved rate, bounded budget | 57.6% on SWE-bench Verified | [Liu et al. 2025](https://arxiv.org/abs/2512.22087) |
| SWE-bench size at release | 2,294 tasks, 12 repositories, best 1.96% | [Jimenez et al. 2023](https://arxiv.org/abs/2310.06770) |
| H2O heavy-hitter budget | 20% of KV, up to 29x throughput | [Zhang et al. 2023](https://arxiv.org/abs/2306.14048) |
| SnapKV at 16K input | 3.6x generation speed, 8.2x memory efficiency | [Li et al. 2024](https://arxiv.org/abs/2404.14469) |
| StreamingLLM extent and speedup | up to 4M tokens, 22.2x | [Xiao et al. 2023](https://arxiv.org/abs/2309.17453) |
| Reflexion HumanEval pass@1 | 91% vs 80% GPT-4 baseline | [Shinn et al. 2023](https://arxiv.org/abs/2303.11366) |

## Context degradation

### Lost in the Middle

- Position matters more than length in the original setup: accuracy is highest when the answer
  document sits first or last, and lowest in the middle. Task: 2,655 NaturalQuestions-Open queries,
  10/20/30 documents of at most 100 tokens.
  [Liu et al. 2023](https://arxiv.org/abs/2307.03172)
- The middle is worse than no context at all. GPT-3.5-Turbo with the answer document mid-context
  scores below its 56.1% closed-book accuracy.
  [Liu et al. 2023](https://arxiv.org/abs/2307.03172)
- Extra context saturates early: going from 20 to 50 retrieved documents buys about +1.5% for
  GPT-3.5-Turbo and about +1% for Claude-1.3, while cost and latency rise.
  [Liu et al. 2023](https://arxiv.org/abs/2307.03172)
- Position sensitivity is an out-of-distribution effect, not a property of long context per se.
  Flan-UL2 shows a 1.9-point best-minus-worst gap inside its 2048-token training window, and a
  U-shape beyond it. [Liu et al. 2023](https://arxiv.org/abs/2307.03172)
- Retrieval itself degrades: worst-case key-value accuracy is 45.6% at 300 pairs, and
  query-aware contextualisation lifts that task to near-perfect while barely changing multi-document QA.
  [Liu et al. 2023](https://arxiv.org/abs/2307.03172)

### Context rot

- Degradation appears on tasks with no retrieval component. Chroma holds task difficulty fixed and
  varies only input length across 18 models, 8 lengths, and 11 needle positions, over 194,480 calls.
  [Chroma 2025](https://research.trychroma.com/context-rot)
- Length alone costs accuracy in a realistic memory setting: LongMemEval prompts average about
  113k tokens against about 300 tokens for the focused version of the same question, and all model
  families score lower on the long version.
  [Chroma 2025](https://research.trychroma.com/context-rot)
- Distractors compound non-uniformly. One distractor already hurts relative to needle-only, and four
  distractors hurt more, with per-distractor differences that grow with length.
  [Chroma 2025](https://research.trychroma.com/context-rot)
- Position was not the driver in their NIAH variant: across 11 positions they report no notable
  variation. This conflicts with Liu et al. and means a model should not assume a fixed position prior.
  [Chroma 2025](https://research.trychroma.com/context-rot)
- Coherent haystacks are worse than shuffled ones across all 18 models, so local structure changes the
  result independently of length. [Chroma 2025](https://research.trychroma.com/context-rot)
- Trivial replication also degrades: on 25 to 10,000 repeated words, accuracy falls with length and
  positional accuracy is best when the unique token is early.
  [Chroma 2025](https://research.trychroma.com/context-rot)

### Length-only effects and NIAH limits

- NIAH under-reports the problem. RULER adds multi-hop tracing and aggregation across 17 models and
  13 tasks; almost all models drop sharply with length, and only about half stay satisfactory at 32K
  despite claimed windows of 32K or more. [RULER](https://arxiv.org/abs/2404.06654)
- Even with perfect retrieval, length hurts. Across 5 models on math, QA, and code, performance falls
  13.9%–85% as input grows, including when irrelevant tokens are whitespace or are masked out.
  [Du et al. 2025](https://arxiv.org/abs/2510.05381)
- The effect is not a distractor artefact: it persists when all relevant evidence sits immediately
  before the question. Reciting the retrieved evidence before answering recovers up to 4% for GPT-4o
  on RULER. [Du et al. 2025](https://arxiv.org/abs/2510.05381)
- Implication for a compaction model: the quality term depends on total token count, not only on
  whether the needed fact survived. Compaction helps twice, by shortening and by re-positioning.

## Compression quality curves

- LLMLingua reports up to 20x compression with little loss across GSM8K, BBH, ShareGPT, and
  Arxiv-March23, using a budget controller plus token-level iterative compression.
  [Jiang et al. 2023](https://arxiv.org/abs/2310.05736)
- LongLLMLingua converts compression into accuracy gains on retrieval-heavy tasks: +21.4% on
  NaturalQuestions at about 4x fewer tokens, and 94.0% cost reduction on LooGLE. It also cuts
  end-to-end latency 1.4x–2.6x at 2x–6x compression on prompts of about 10k tokens.
  [Jiang et al. 2023](https://arxiv.org/abs/2310.06839)
- LLMLingua-2 moves to a token-classification objective and reports 2x–5x compression, 3x–6x faster
  compression, and 1.6x–2.9x lower end-to-end latency. The 2x–5x band is the honest operating range
  for extractive compression. [Pan et al. 2024](https://arxiv.org/abs/2403.12968)
- Gist tokens reach 26x prompt compression with 40% FLOPs reduction and 4.2% wall-clock speedup,
  but require attention-mask training of the base model.
  [Mu et al. 2023](https://arxiv.org/abs/2304.08467)
- Soft-prompt methods sit at lower ratios. ICAE reaches 4x with about 1% additional parameters.
  [Ge et al. 2023](https://arxiv.org/abs/2307.06945) AutoCompressor trains on sequences up to 30,720
  tokens and stores prior segments as summary vectors.
  [Chevalier et al. 2023](https://arxiv.org/abs/2305.14788)
- Read the ratios carefully. Token-level compression preserves surface spans, so a 20x result on a
  benchmark prompt does not transfer to an agent transcript where the surviving tokens are tool output.
  No cited source measures ratio against quality for *LLM-written* summaries of agent trajectories.
  Compact-Bench is the closest, and it measures retention rather than ratio.
  [Compact-Bench](https://arxiv.org/abs/2610.31710)

## Agent memory and compaction policies

### MemGPT and the tiered-memory lineage

- MemGPT exposes the policy parameters explicitly: a memory-pressure warning at about 70% of the
  window, a flush at 100%, eviction of about 50% of the window, and a recursive summary carried at the
  head of the FIFO queue. [Packer et al. 2023](https://arxiv.org/abs/2310.08560)
- Retrieval beats lossy summarisation on their own benchmark: deep memory retrieval accuracy goes from
  32.1% to 92.5% (GPT-4) and 35.3% to 93.4% (GPT-4 Turbo), while GPT-3.5 goes from 38.7% to 66.9%.
  [Packer et al. 2023](https://arxiv.org/abs/2310.08560)
- Baselines in that comparison saw a lossy summary of five prior sessions, which is the same mechanism
  a compaction policy uses. The gap is evidence that summarisation, not capacity, causes the loss.
  [Packer et al. 2023](https://arxiv.org/abs/2310.08560)

### Generative Agents retrieval weights

- Retrieval scores three signals: recency as a geometric decay over memory order, importance from an
  LLM-assigned 1–10 poignancy, and relevance as embedding cosine similarity.
  [Park et al. 2023](https://arxiv.org/abs/2304.03442)
- The released code weights them `[0.5, 3, 2]` for recency, relevance, importance, after min-max
  normalising each component to [0,1], and keeps the top 30 nodes.
  [retrieve.py](https://github.com/joonspk-research/generative_agents/blob/main/reverie/backend_server/persona/cognitive_modules/retrieve.py)
- The decay base is 0.995 per step in the paper's description; this pass did not re-read that value
  from the full text, so treat the exact base as **unverified** while the functional form is confirmed
  by code. [Park et al. 2023](https://arxiv.org/abs/2304.03442)
- Relevance dominates in practice (weight 3 of 5.5 total, 54.5% derived). This is the closest thing to
  a published default for "what to keep" in an agent memory stream.

### Reflexion

- Reflexion keeps a bounded episodic buffer of verbal self-critiques rather than raw history, reaching
  91% pass@1 on HumanEval against 80% for the GPT-4 baseline.
  [Shinn et al. 2023](https://arxiv.org/abs/2303.11366)
- The buffer is written at episode boundaries, so the policy is event-triggered, not threshold-triggered.
  This is a distinct third option beside "on overflow" and "on schedule".

### Claude Code

- The default trigger is the model context limit, not a fraction of it. Haiku 5.5 on a 1M window
  compacts at about 967K tokens, which is 96.7% (derived).
  [Claude Code docs](https://code.claude.com/docs/en/model-config.md)
- The threshold is configurable per model, per launch, or by environment variable, in the range
  100K–1M tokens. [Claude Code docs](https://code.claude.com/docs/en/model-config.md)
- Compaction is partial, not total. After the pass, Claude Code re-reads up to five files, most
  recently modified first, and returns any file over 5,000 tokens as a path reference only.
  [Claude Code docs](https://code.claude.com/docs/en/context-window.md)
- Re-injection is budgeted: invoked skills are capped at 5,000 tokens each and 25,000 tokens total,
  oldest dropped first. This is an explicit two-level token budget a model can copy.
  [Claude Code docs](https://code.claude.com/docs/en/context-window.md)
- Manual escapes exist: `/compact <focus>`, and `/rewind` with "Summarize from here" or "Summarize up to
  here", which let a user or policy move the cut point rather than only the trigger time.
  [Claude Code docs](https://code.claude.com/docs/en/context-window.md)

### Anthropic context-engineering guidance

- Compaction preserves architectural decisions, unresolved bugs, and implementation details, and
  discards redundant tool outputs, then continues with the five most recently accessed files.
  [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Anthropic names tool-result clearing as the safest lightest-touch compaction, which implies tool
  output is the highest-yield eviction target before summarisation.
  [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Tuning advice is recall first, then precision: maximise recall of the trace, then remove surplus.
  This is a two-stage objective, not a single ratio.
  [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Sub-agents return about 1,000–2,000 tokens from tens of thousands consumed, which is an alternative
  to compaction with a measurable compression ratio of roughly 10x–50x (derived).
  [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- The stated mechanism is quadratic attention over n tokens plus training on shorter sequences, giving
  "a performance gradient rather than a hard cliff".
  [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### OpenAI compaction

- Compaction is a first-class API surface with a token threshold: `context_management` with
  `compact_threshold`, documented at 200,000 tokens in every code sample.
  [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction.md)
- Two modes: in-stream server-side compaction when the rendered count crosses the threshold, and a
  stateless `/responses/compact` endpoint for explicit control.
  [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction.md)
- The compaction item is opaque and encrypted, and callers are told not to prune it, so the summary is
  not inspectable. A model cannot audit what the provider kept.
  [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction.md)
- Guidance calls compaction a default long-run primitive rather than an emergency fallback.
  [OpenAI](https://developers.openai.com/blog/skills-shell-tips.md)

### Cursor

- Public docs list per-model default and maximum context (for example Claude Fable 5.1 at 300k default,
  1M maximum), and describe rules, skills, and subagents as context controls.
  [Cursor docs](https://cursor.com/docs)
- Cursor does not publish its compaction trigger, retention set, or summary prompt. Any claim about its
  policy is **unverified**.

## Theory toolbox

### Rate–distortion

Standard lossy source coding: the rate–distortion function is

```
R(D) = min_{p(y|x) : E[d(X,Y)] <= D} I(X; Y)
```

and the operational form is the Lagrangian `min I(X;Y) + beta * D`. Raise `beta` to buy distortion
reduction with bits. Summarisation is the same problem with a task-defined distortion, which the
information bottleneck paper states directly as a generalisation of rate–distortion where the
distortion measure emerges from the joint statistics of input and target.
[Tishby et al. 2000](https://arxiv.org/abs/physics/0004057)

For compaction the useful object is the marginal value of a token, `-dD/dR`. Decide to compact when the
marginal value of the oldest retained tokens falls below the price `lambda` of a token in the window.
That turns the timing question into an allocation question with a shadow price.

### Information bottleneck

```
min_{p(t|x)} I(X;T) - beta * I(T;Y)
```

`T` is the summary, `X` the trajectory, `Y` the task outcome. The `I(T;Y)` term is what a
similarity-only retention score misses, and it justifies scoring candidates by predictive value for the
task rather than by resemblance to the query.
[Tishby et al. 2000](https://arxiv.org/abs/physics/0004057)

### Renewal-reward and EOQ

Treat each compaction as an order with fixed cost `K` (tokens spent summarising, plus expected fidelity
loss), a holding cost `h` per token per turn, and a token arrival rate `D` per turn. The classic EOQ
cost and optimum are

```
C(Q) = K*D/Q + h*Q/2
Q*   = sqrt(2*K*D/h)
```

with cycle length `T* = Q*/D` and cost `C* = sqrt(2*K*D*h)`. Text-book result; see the standard
derivation and variable definitions in
[EOQ](https://en.wikipedia.org/wiki/Economic_order_quantity) (tertiary source).

Renewal-reward supplies the general statement: for i.i.d. cycles, the long-run reward per unit time is
`E[reward per cycle] / E[cycle length]`, so maximising quality per token is a ratio objective, not a
per-turn objective. The EOQ form is the special case with linear holding cost.

Two consequences matter for the model:

- The optimal trigger is a *sawtooth*: compact at a fixed fill level, not at a fixed turn count.
- `Q*` scales as `1/sqrt(h)`. If holding cost grows with length because of degradation, `h` is not
  constant and the closed form only bounds the optimum from above.

### Budgeted selection: knapsack and submodular

Choose a retained set `S` to maximise `f(S)` subject to `sum_{i in S} c_i <= B`, where `c_i` is the
token cost of item `i`. If `f` is monotone submodular and the constraint is a cardinality bound, greedy
achieves at least `1 - 1/e` of the optimum (Nemhauser, Wolsey, and Fisher, 1978; standard result, not
re-verified here). Under a general knapsack constraint the constant guarantee weakens, so the practical
route is greedy with cost-benefit ordering plus a repair step.

H2O is the applied precedent: it formulates KV-cache eviction as a dynamic submodular problem and
proves a guarantee for its eviction algorithm, retaining 20% heavy hitters with up to 29x throughput gain.
[Zhang et al. 2023](https://arxiv.org/abs/2306.14048)

### KV eviction as an analogue

- StreamingLLM shows that keeping a few initial tokens as attention sinks restores window attention, and
  sustains up to 4M tokens with 22.2x speedup over sliding-window recomputation.
  [Xiao et al. 2023](https://arxiv.org/abs/2309.17453)
- The analogue for a text window: always retain a fixed prefix (system rules, task statement) and a
  recency tail, and treat only the middle as evictable. This is exactly what Claude Code and MemGPT do.
- SnapKV selects per-head important positions from an observation window at the end of the prompt,
  reaching 3.6x generation speed and 8.2x memory efficiency at 16K input, and 380K context on one
  A100-80GB. [Li et al. 2024](https://arxiv.org/abs/2404.14469)
- Caveat: KV eviction optimises next-token fidelity given the full prefix, which is a different
  objective from preserving task state across a summary boundary. Use it as a selection heuristic, not
  as evidence about compaction quality.

### Context collapse

Iterative rewriting erodes detail over successive passes; the ACE paper names this "context collapse"
and reports that structured incremental updates avoid it, gaining +10.6% on agent benchmarks and +8.6%
on finance tasks. [Zhang et al. 2025](https://arxiv.org/abs/2510.04618)

For the model this is a per-compaction decay factor on retained state, applied multiplicatively across
cycles. That is the term that makes repeated compaction worse than one late compaction.

## Coding-agent evidence

### Trajectory shape and cost

- SWE-bench at release: 2,294 tasks across 12 Python repositories, best model 1.96% resolved.
  [Jimenez et al. 2023](https://arxiv.org/abs/2310.06770)
- SWE-agent reaches 12.5% pass@1 on SWE-bench and 87.7% on HumanEvalFix with a custom
  agent-computer interface, attributing much of the gain to interface design that controls what enters
  context. [Yang et al. 2024](https://arxiv.org/abs/2405.15793)
- The interface result matters for the model: context policy and tool-output formatting are coupled.
  A compaction model that ignores tool-output format will mis-price `h`.

### Compaction ablations

- Compact-Bench isolates the replacement step by pairing full-history and summary-only continuations
  from a shared repository state: 35 SWE-bench repairs, 146 sessions, 106 production chains, 14
  summarizer backbones. [Sun et al. 2026](https://arxiv.org/abs/2610.31710)
- Damage is large and variance is summarizer-driven: 5%–64% of 22 full-history successes are lost,
  with Claude Opus 4.8 preserving the most repairs and DeepSeek-Flash the fewest.
  [Sun et al. 2026](https://arxiv.org/abs/2610.31710)
- Retention is poor for recurring details: LLM summaries keep at most 16.0% against 79.1% for
  mechanical extraction, and production summaries keep 15.7% at the first boundary.
  [Sun et al. 2026](https://arxiv.org/abs/2610.31710)
- Prompt choice moves task continuation: with Kimi-K3 as summarizer the Kimi Code prompt keeps 19 of 22
  continuations, while the Claude Code prompt keeps the most recurring details at 15.0%. Retention and
  continuation are not the same objective.
  [Sun et al. 2026](https://arxiv.org/abs/2610.31710)
- Failures are systematic, not random: one repair is damaged by 13 of 14 backbones, another by all 5
  prompts. A per-task hazard term is real.
  [Sun et al. 2026](https://arxiv.org/abs/2610.31710)

### Learned timing

- AutoCompact trains the agent to decide when to compact as part of its policy, using judge-reviewed
  corrections on compaction decisions, summaries, and post-compaction actions, then RL on task success.
  Gains: +9.2% SWE-bench Verified, +5.0% SWE-PolyBench Verified, absolute, across all inference budgets,
  including a 16K window with fallback compaction.
  [Zhang et al. 2026](https://arxiv.org/abs/2610.02163)
- CAT treats context management as a callable tool with a structured workspace of stable task semantics,
  condensed long-term memory, and high-fidelity short-term interactions; the trained SWE-Compressor
  reaches 57.6% on SWE-bench Verified under a bounded budget, beating ReAct and static compression.
  It names the failure modes as context explosion, semantic drift, and degraded reasoning under
  append-only or passively triggered compression.
  [Liu et al. 2025](https://arxiv.org/abs/2512.22087)
- Both results are end-state comparisons. Neither publishes the trigger-time distribution, so they
  support "timing is learnable" but not a specific threshold.

## Model-relevant quantities

| Signal | Definition | Use in the model | Supporting literature | Confidence |
|---|---|---|---|---|
| Token pressure | `rho = T / C`, used tokens over window | Primary trigger variable; deployed policies key on it | MemGPT 70%/100% ([link](https://arxiv.org/abs/2310.08560)); Claude Code 96.7% ([link](https://code.claude.com/docs/en/model-config.md)); OpenAI 200k threshold ([link](https://developers.openai.com/api/docs/guides/compaction.md)) | high |
| Growth rate | `dT/dt`, tokens per turn, or per tool call | Sets `D` in the renewal model and the time-to-threshold forecast | Anthropic notes quadratic attention and tool-driven growth ([link](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)) | medium; no published per-turn distribution |
| Reuse hazard | Probability that an item is referenced again in later turns | Decides which items survive; the EOQ analogue of demand rate per item | Compact-Bench recurring-detail retention 15.7%–16.0% ([link](https://arxiv.org/abs/2610.31710)) | low; no hazard curve published |
| Semantic drift | Divergence between summary and re-derived state across cycles | Multiplicative decay term for repeated compaction | ACE "context collapse" ([link](https://arxiv.org/abs/2510.04618)); CAT "semantic drift" ([link](https://arxiv.org/abs/2512.22087)) | medium; qualitative only |
| Tool-output share | Fraction of `T` from tool results | Cheapest eviction target; adjust `h` per segment | Anthropic tool-result clearing ([link](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)) | medium; no measured share |
| Phase | Exploration, edit, test, review | Changes `K` and `h`; compaction mid-edit is costlier | CAT milestone compression ([link](https://arxiv.org/abs/2512.22087)); Reflexion episode boundaries ([link](https://arxiv.org/abs/2303.11366)) | medium |
| Position of key items | Relative index of must-keep items | Weight for retention; also predicts post-compaction loss | Liu et al. U-shape ([link](https://arxiv.org/abs/2307.03172)); Chroma null result ([link](https://research.trychroma.com/context-rot)) | conflicting |
| Length penalty | Accuracy loss as a function of `T` at fixed task | The `h(T)` term; makes the objective non-linear | 13.9%–85% at perfect retrieval ([link](https://arxiv.org/abs/2510.05381)); RULER ([link](https://arxiv.org/abs/2404.06654)) | medium; monotone but unfitted |
| Summarizer fidelity | Retained-state fraction for a given summarizer and prompt | `K` term; the dominant variance source | Compact-Bench 5%–64% damage ([link](https://arxiv.org/abs/2610.31710)) | medium; n=22 baseline successes |
| Budget split | Tokens for prefix, recency tail, summary | Constrains the feasible policy space | Claude Code 5-file / 5,000-token / 25,000-token caps ([link](https://code.claude.com/docs/en/context-window.md)) | high |

Two derived quantities are worth naming in the spec.

- Break-even fidelity: compact only if `expected_tokens_saved * lambda > P(loss) * cost(rework)`.
  Deployed damage of 5%–64% implies the right-hand side is not small.
- Cost of delay: holding a near-full window for `n` more turns costs `n * h * T` plus the length
  penalty, which grows faster than linear if `h` increases with `T`.

## Evidence gaps

- No fitted degradation curve. Sources report monotone decline and endpoint gaps, not parameters.
  A model must adopt a functional form and calibrate it locally.
- No position consensus. Liu et al. find a strong U-shape; Chroma finds no notable position effect in
  their NIAH variant. Treat position weight as a tunable, defaulting to small.
- Compaction timing is not isolated in any ablation. Compact-Bench isolates the replacement, AutoCompact
  and CAT report end state. Nobody publishes quality as a function of trigger point at fixed token budget.
- Small samples. Compact-Bench's headline damage range rests on 22 full-history successes.
- Summarizer fidelity is measured on recurring details, not on code semantics. No study measures
  whether a summary preserves a failing test's exact assertion or a stack trace's line numbers.
- Reuse hazard is unmeasured. No source gives `P(reference again)` by item type, which is the input the
  knapsack step needs most.
- Cost per turn is unpriced. No source ties compaction decisions to billed tokens under prompt caching,
  where a compaction invalidates the cached prefix. This is likely the largest omitted term for real
  deployments.
- Vendor policies are partly opaque. Cursor publishes no compaction trigger. OpenAI's compaction item is
  encrypted, so retention cannot be audited.
- Windsurf context handling was not verified in this pass.
- The Generative Agents decay base (0.995) was not re-read from the full text in this pass.

## Sources

Primary papers

- Liu et al. 2023, *Lost in the Middle*, TACL. https://arxiv.org/abs/2307.03172
- Hong, Troynikov, Huber 2025, *Context Rot*, Chroma technical report. https://research.trychroma.com/context-rot
- Hsieh et al. 2024, *RULER*, COLM. https://arxiv.org/abs/2404.06654
- Du et al. 2025, *Context Length Alone Hurts LLM Performance Despite Perfect Retrieval*, EMNLP Findings. https://arxiv.org/abs/2510.05381
- Jiang et al. 2023, *LLMLingua*, EMNLP. https://arxiv.org/abs/2310.05736
- Jiang et al. 2023, *LongLLMLingua*, ACL 2024. https://arxiv.org/abs/2310.06839
- Pan et al. 2024, *LLMLingua-2*, ACL Findings. https://arxiv.org/abs/2403.12968
- Mu et al. 2023, *Learning to Compress Prompts with Gist Tokens*, NeurIPS. https://arxiv.org/abs/2304.08467
- Chevalier et al. 2023, *Adapting Language Models to Compress Contexts*, EMNLP. https://arxiv.org/abs/2305.14788
- Ge et al. 2023, *In-context Autoencoder for Context Compression*, ICLR 2024. https://arxiv.org/abs/2307.06945
- Packer et al. 2023, *MemGPT*. https://arxiv.org/abs/2310.08560
- Park et al. 2023, *Generative Agents*, UIST. https://arxiv.org/abs/2304.03442
- Generative Agents reference implementation, `retrieve.py`. https://github.com/joonspk-research/generative_agents/blob/main/reverie/backend_server/persona/cognitive_modules/retrieve.py
- Shinn et al. 2023, *Reflexion*, NeurIPS. https://arxiv.org/abs/2303.11366
- Zhang et al. 2023, *H2O*, NeurIPS. https://arxiv.org/abs/2306.14048
- Xiao et al. 2023, *Efficient Streaming Language Models with Attention Sinks*, ICLR 2024. https://arxiv.org/abs/2309.17453
- Li et al. 2024, *SnapKV*, NeurIPS. https://arxiv.org/abs/2404.14469
- Tishby, Pereira, Bialek 2000, *The information bottleneck method*. https://arxiv.org/abs/physics/0004057
- Jimenez et al. 2023, *SWE-bench*, ICLR 2024. https://arxiv.org/abs/2310.06770
- Yang et al. 2024, *SWE-agent*, NeurIPS. https://arxiv.org/abs/2405.15793
- Sun et al. 2026, *Compact-Bench*. https://arxiv.org/abs/2610.31710
- Zhang et al. 2026, *AutoCompact*. https://arxiv.org/abs/2610.02163
- Liu et al. 2025, *Context as a Tool* (CAT, SWE-Compressor). https://arxiv.org/abs/2512.22087
- Zhang et al. 2025, *Agentic Context Engineering* (ACE), ICLR 2026. https://arxiv.org/abs/2510.04618

Official documentation and engineering posts

- Claude Code, *Model configuration* (auto-compact thresholds). https://code.claude.com/docs/en/model-config.md
- Claude Code, *Explore the context window* (what survives compaction). https://code.claude.com/docs/en/context-window.md
- Anthropic, *Effective context engineering for AI agents*. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- OpenAI, *Compaction* guide. https://developers.openai.com/api/docs/guides/compaction.md
- OpenAI, *Shell + Skills + Compaction*. https://developers.openai.com/blog/skills-shell-tips.md
- Cursor, documentation index and model context table. https://cursor.com/docs

Tertiary reference

- *Economic order quantity*, standard derivation of `Q* = sqrt(2KD/h)`. https://en.wikipedia.org/wiki/Economic_order_quantity
