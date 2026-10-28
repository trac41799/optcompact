# Compaction scheduling model

**Status:** Proposed · **Version:** 1.0 · **Governing ADR:** [ADR-0001](../decisions/ADR-0001-hazard-rate-distortion-model.md)

## 1. Purpose

This document defines the mathematical model that decides **when** a coding-agent session compacts, **which span** it shadows, and **how aggressively** it summarizes. The model maximizes task-relevant context value per token spent. It separates three quantities that most harnesses conflate: token pressure, information value, and summary fidelity.

The model answers one question per turn:

> Compact now, or carry the context one more turn?

The engine MUST emit a decision on every observed turn. The decision MUST be explainable as a sum of token-denominated terms.

## 2. Scope

In scope:

- a per-turn decision rule with a closed-form gain expression;
- a renewal-reward derivation of the economic compaction interval;
- a rate-distortion model of summary fidelity;
- estimators for every quantity the rule needs;
- a measurement protocol for retained quality.

Out of scope:

- summary prompt design (owned by the harness backend);
- tokenizer implementation (the host supplies token counts);
- model routing and pricing tables (the host supplies prices).

## 3. Notation

| Symbol | Meaning | Unit |
|---|---|---|
| `t` | Turn index, 1-based | turn |
| `W` | Context window | token |
| `R` | Output reservation | token |
| `B` | Safety headroom | token |
| `N_t` | Derived context size at the start of turn `t` | token |
| `g` | Recent context growth rate | token/turn |
| `λ` | Input token price | utility/token |
| `λ_o` | Output token price | utility/token |
| `s_i` | Token size of context unit `i` | token |
| `r_i` | Last turn that referenced unit `i` | turn |
| `θ_i` | Unit type (goal, constraint, file, tool output, error, decision, chatter) | — |
| `w_i` | Re-derivation cost of unit `i` | token-equivalent |
| `h_i(t)` | Reuse hazard: need probability per future turn | 1/turn |
| `τ` | Hazard decay constant | turn |
| `β` | Per-turn discount factor | — |
| `ρ` | Retention ratio of a summary, `summary_tokens / shadowed_tokens` | — |
| `φ_i` | Fidelity: value fraction of unit `i` surviving summarization | — |
| `S` | Tokens in the shadowed span | token |
| `ν` | Load-degradation price | utility |
| `p` | Load-degradation exponent | — |

Utility is measured in **token-equivalents**: one unit equals the cost of one input token. This keeps every term additive and auditable.

## 4. Assumptions

- **A1 — Causal prefix.** A compaction shadows a contiguous oldest span and keeps a recent tail. Harnesses cannot rewrite arbitrary interior spans safely.
- **A2 — Local reuse decay.** The probability that a unit is needed again decays with the distance since its last reference. Empirical agent traces support a roughly exponential tail.
- **A3 — Fidelity is monotone in `ρ`.** A larger summary preserves more value, with diminishing returns. `φ(1) = 1`.
- **A4 — Compaction cost is linear in the shadowed span** for input tokens, plus a fixed call cost `c_0`.
- **A5 — Loss compounds across generations.** A summary of a summary retains `φ` of the prior summary's value.
- **A6 — Degradation grows superlinearly with load.** Quality loss rises with `N/W`; the model uses exponent `p ≥ 1`.
- **A7 — Prices are stationary within a session.** Route changes start a new calibration window.
- **A8 — The recent tail is sufficient for the active step.** The retained tail is chosen to cover the current tool pair and the last user instruction.

A1 and A8 are harness constraints, not claims about model behavior. A2, A3, and A6 are empirical claims with calibration hooks.

## 5. Unit value model

### 5.1 Hazard

For unit `i` observed at turn `t`:

$$
h_i(t) = a_{\theta_i}\,\exp\!\left(-\frac{t-r_i}{\tau}\right),\qquad h_i(t)\ge h_{\min}
$$

`a_θ` is a type prior. Defaults:

| Type | `a_θ` | `w_i` rationale |
|---|---|---|
| goal | 0.9 | Losing the goal forces re-planning |
| constraint | 0.8 | Violations cause rework and user correction |
| decision | 0.6 | Rationale is expensive to reconstruct |
| error | 0.7 | Exact strings matter for diagnosis |
| file | 0.4 | Re-readable at `s_i` tokens |
| tool output | 0.25 | Usually bulk, low density |
| chatter | 0.1 | Small residual value |

### 5.2 Re-derivation cost

`w_i` is the token cost of recovering the unit if it is lost, plus a risk multiplier `κ_θ`:

$$
w_i = \kappa_{\theta_i}\, s_i
$$

Defaults: goal `κ=8`, constraint `κ=6`, decision `κ=3`, error `κ=2`, file `κ=1.2`, tool output `κ=0.5`, chatter `κ=0.1`. A file unit therefore costs slightly more to lose than to re-read. A goal unit costs eight times its length to lose.

### 5.3 Discounted future value

With per-turn discount `β < 1`, the discounted sum of future hazard-weighted re-derivation costs is geometric:

$$
V_i(t)=\sum_{d\ge 1}\beta^{d}\,w_i\,h_i(t+d)
      = w_i\,a_i\,e^{-(t-r_i)/\tau}\cdot\frac{\beta q}{1-\beta q},
\qquad q=e^{-1/\tau}
$$

Define `κ_β = βq/(1−βq)`. Then `V_i(t) = κ_β · w_i · a_i · e^{−(t−r_i)/τ}`.

When `β = 1`, replace the infinite sum with a finite horizon `H`: `κ_β = q(1−q^H)/(1−q)`.

**Proposition 1 (monotone value).** `V_i` decreases in `t − r_i` and increases in `w_i`, `a_i`, `τ`. Proof: direct differentiation of the geometric sum. ∎

## 6. Summary fidelity

### 6.1 Distortion curve

For a span of `S` tokens summarized at ratio `ρ`, average fidelity follows a Weibull form:

$$
\varphi(\rho,S)=1-d(S)\,(1-\rho)^{\gamma}
$$

$$
d(S)=d_{\min}+(d_{\max}-d_{\min})\left(1-e^{-S/S_0}\right)
$$

`γ` controls curvature, `d(S)` is the distortion floor at `ρ = 0`, and `S_0` is the span size at which summarizer omission saturates. Defaults: `γ = 1`, `d_min = 0.15`, `d_max = 0.85`, `S_0 = 60,000`.

Per-type ceiling:

$$
\varphi_i=\varphi_{\max}(\theta_i)\cdot\varphi(\rho,S)
$$

Exact identifiers are harder to preserve than prose: `φ_max(goal)=1.0`, `constraint=0.95`, `decision=0.9`, `error=0.95`, `file=0.85`, `tool output=0.8`, `chatter=0.9`.

### 6.2 Generation penalty

After `m` successive compactions of the same lineage:

$$
\varphi_i^{(m)} = \varphi_i^{\,m}
$$

A session that compacts five times retains `φ^5` of the original value in the oldest material. The engine MUST track `m` per checkpoint and apply this penalty.

### 6.3 Empirical anchor

The fidelity curve is calibrated, not assumed. The calibration experiment measures anchor retention (Section 10) at `ρ ∈ {0.05, 0.1, 0.2, 0.3, 0.5}` and fits `(γ, d_min, d_max, S_0)` by least squares. The spec fixes the **form**; calibration fixes the **parameters**.

Evidence bounds the parameters. Compact-Bench measures detail retention far below mechanical extraction, including at the first production boundary ([Compact-Bench](https://arxiv.org/abs/2610.31710); numbers in the [literature note](../research/compaction-literature.md)). The defaults in Section 15 are therefore upper bounds for detail-bearing units, not measurements. Calibration for any deployment MUST report the fitted value next to the default.

## 7. Objective

Let `A` be the compaction schedule and `K_t` the kept tail at turn `t`. The engine maximizes:

$$
J(A)=\mathbb{E}\Big[\underbrace{U_0-\sum_i (1-\varphi_i)\,w_i\,\mathbf{1}[\text{unit } i \text{ needed and lost}]}_{\text{task utility}}\Big]
-\lambda\sum_t N_t
-\sum_{c\in A}\big(c_0+\lambda_{\text{in}}S_c+\lambda_o\rho S_c\big)
$$

Subject to `N_t ≤ W − R − B`.

Equivalently, with `L = β/(1−β)` expected remaining turns, keeping unit `i` for one more turn costs `λ s_i` and delays its summary cost. The objective decomposes into independent per-unit terms plus a fixed cost. That decomposition yields the decision rule in Section 8.

## 8. Decision rule

### 8.1 Per-unit net gain

Summarizing unit `i` now:

$$
G_i=\underbrace{\lambda\,L\,s_i\,(1-\rho)}_{\text{future tokens saved}}
-\underbrace{\big(\lambda_{\text{in}}s_i+\lambda_o\rho s_i\big)}_{\text{summary cost}}
-\underbrace{\Lambda\,(1-\varphi_i)\,V_i}_{\text{lost value, priced}}
$$

`Λ` is `lossAversion`. It prices quality loss above raw re-derivation cost because a lost fact can fail the task. `G_i` is positive when saved carrying cost exceeds summary cost plus priced loss.

### 8.2 Prefix selection

A new compaction may leave the existing checkpoint untouched or fold it into the new summary. Folding frees more tokens and degrades quality further. The engine evaluates both options. It rejects a candidate whose operation fidelity falls below `quality_floor`. It never folds a checkpoint whose fidelity is below `checkpoint_floor`.

The shadowed span is a prefix, so the engine maximizes a prefix sum:

$$
k^\*=\arg\max_{k\in\mathcal{K}}\ \sum_{i\le k}G_i
\qquad
\mathcal{K}=\{k:\ k\le n-m,\ \text{cut }k\text{ is tool-balanced}\}
$$

`m` is the retained tail floor. The sum telescopes, so one pass over `n` units computes every candidate in `O(n)` time.

**Proposition 2 (prefix optimality).** For a fixed `ρ`, the best prefix is a maximizer of the prefix-sum sequence. No interior subset beats a prefix under A1. Proof: feasibility is a prefix constraint; the objective is additive. ∎

### 8.3 Risk and urgency

Load is `ℓ = N_t/W`. Degradation cost is `δ(ℓ) = ν ℓ^p`. Compacting reduces load by `Δℓ = S(1−ρ)/W`. The risk benefit is:

$$
\mathrm{Risk}(t)=L\,\nu\left[\ell^{p}-(\ell-\Delta\ell)^{p}\right]
$$

The total decision value:

$$
\Gamma(t)=\sum_{i\le k^\*}G_i+\mathrm{Risk}(t)-c_0
$$

**Decision.**

- If `N_t + g > W − R − B`: compact with `urgency = hard`, choosing the largest feasible `k`.
- Else if `Γ(t) > θ_h` and the cooldown has elapsed: compact with `urgency = soft`.
- Else: keep, and report the next evaluation turn.

`θ_h > 0` is a hysteresis margin. Cooldown is `max(3, 0.1·T*)` turns. Hysteresis prevents compaction thrash when `Γ` oscillates around zero.

### 8.4 Retention ratio

For each candidate cut the engine selects `ρ` by maximizing `Γ` over a small grid:

$$
\rho^\*=\arg\max_{\rho\in\{0.05,0.08,0.12,0.16,0.25,0.4\}}\Gamma(t;\rho)
$$

The default grid matches common harness defaults. A continuous refinement uses the first-order condition:

$$
\frac{\partial}{\partial\rho}\Big[-\lambda L S(1-\rho)-\lambda_o\rho S-\sum_i\big(1-\varphi_i(\rho)\big)V_i\Big]=0
$$

which reduces to `λLS − λ_o S = Σ_i V_i · ∂φ_i/∂ρ`. The left side is the marginal price of one summary token; the right side is the marginal value it preserves. Compact more aggressively while the right side is smaller.

## 9. Renewal-reward interval

Consider a stationary regime: constant growth `g`, uniform value density `v`, constant fidelity `φ`, retention `ρ`. Compaction every `T` turns shadows `S = gT`.

Per-turn cost:

$$
C(T)=\frac{c_0}{T}
+\lambda\frac{\rho gT}{2}
+\underbrace{(1-\varphi)\,v\,g}_{\text{loss rate}}
+\underbrace{\big(\lambda_{\text{in}}+\lambda_o\rho\big)g}_{\text{summary rate}}
+\delta(\ell(T))
$$

Only the first two terms depend on `T` when degradation is flat. Minimizing them gives the economic interval:

$$
T^\*_{\text{econ}}=\sqrt{\frac{2c_0}{\lambda\,\rho\,g}}
$$

**Proposition 3 (EOQ form).** `C(T)` is convex on `T>0`; the unique minimizer solves `c_0/T² = λρg/2`. The interval grows with the square root of the fixed cost and shrinks with the square root of price times growth. ∎

With degradation, `δ` increases in `T`, so the total optimum satisfies `T*_risk < T*_econ`. The engine reports both values: `T*_econ` as a sanity bound and the per-turn rule as the operative decision.

**Proposition 4 (price invariance under uniform pricing).** Write `λ_in = λ` and `w_i = κ_θ s_i`, so every term of `G_i` carries one factor of `λ` except the fixed cost. Then `G_i/λ` is independent of `λ`, and the soft decision threshold does not move with the token price. Price changes act only through the fixed-call amortization `c_0` and through any non-uniform output price. ∎

Proposition 4 explains why provider price cuts alone rarely justify a different compaction policy. It also means `λ` matters most when the summary call is expensive or when output tokens are priced above input tokens.

**Corollary (why fixed thresholds are wrong).** A fixed pressure threshold ignores `g`, `c_0`, value density, and fidelity. Two sessions at the same load can have opposite optimal decisions. Fixed thresholds are retained only as a fallback and as a baseline.

## 10. Quality measurement

### 10.1 Anchor retention score

An **anchor** is an atomic, checkable fact: a path, symbol, error string, numeric constraint, decision, or requirement. Extract anchors from the pre-compaction span with weighted regex and identifier extraction. Weight by type: requirement 3, path 2, error 2, decision 2, number 1.

$$
\mathrm{ARS}=\frac{\sum_{a}\omega_a\,\mathbf{1}[a\in\text{post-compaction context}]}{\sum_a\omega_a}
$$

`ARS` is the operational definition of retained quality `q`. It is deterministic, cheap, and auditable.

### 10.2 Compaction efficiency ratio

$$
\mathrm{CER}=\frac{\lambda L S(1-\rho)}{c_0+\lambda_{\text{in}}S+\lambda_o\rho S+\sum_i(1-\varphi_i)V_i}
$$

`CER > 1` means the compaction pays for itself. Report `CER` with every decision. The median `CER` across a session is the headline quality metric for a policy.

### 10.3 Operating point

The **operating point** is the pair `(k, q)` where `k = 1 − N_after/N_before` and `q = ARS`. The efficient frontier is the upper envelope of achievable `(k, q)` pairs. A policy is admissible only if it lies on the frontier within measurement error. The scalarized objective is `U = q − μk`, where `μ` is the user price of one unit of savings. The default `μ = 0.25` encodes "one quality point is worth four savings points".

## 11. Estimators

| Quantity | Estimator | Update |
|---|---|---|
| `r_i` | Last turn whose text shares identifiers with unit `i` | On every new unit |
| `a_θ` | Type prior, adjusted by observed reuse rate | Per session, EWMA |
| `τ` | MLE on observed reuse gaps, fallback 12 turns | Per session |
| `g` | EWMA of `ΔN/Δt`, half-life 10 turns | Every turn |
| `β` | `1 − 1/H`, `H` from task phase, default 50 | Per turn |
| `φ(ρ,S)` | Calibrated curve, per summarizer model | Offline |
| `λ, λ_o` | Host price table | Per route |
| `ν, p` | Calibrated degradation, defaults `p=2`, `ν=0.5·λW` | Offline |

Identifier recurrence is the key signal. When a later unit mentions a path, symbol, or error from an older unit, the older unit was needed. That event updates `r_i` and the session reuse rate without an LLM call.

## 12. Algorithm

```
decide(state) -> Decision
  if pressure(state) >= 1: return forcedCompact(state)
  if turn - lastCompactTurn < cooldown: return keep("cooldown")
  for each unit i: compute V_i, phi_i, G_i
  prefix = cumulativeSum(G)
  best = argmax over feasible k of prefix[k] + Risk(k)
  if best.value > theta_h: return compact(k=best.k, rho=best.rho)
  return keep(nextCheckIn = T_econ)
```

Complexity is `O(n + |grid|·n)` per evaluated turn, where `n` is the number of surface units. With `n ≤ 2000` and a six-point grid, the rule costs well under a millisecond in JavaScript.

## 13. Relation to prior work

- **Compact-Bench.** Measures task-continuation damage from production-style compaction and shows that summarizer fidelity, not token reduction, is the binding constraint ([paper](https://arxiv.org/abs/2610.31710)). It motivates the fidelity term and the anchor-retention metric. See the [literature note](../research/compaction-literature.md).
- **AutoCompact.** Learns when to compact and reports gains on SWE-bench Verified ([paper](https://arxiv.org/abs/2610.02163)). It is the closest prior art. This model differs in three ways: it needs no training, it exposes every term for audit, and it runs inside the harness rather than around it.
- **CAT / SWE-Compressor.** Compacts at task milestones under a bounded budget ([paper](https://arxiv.org/abs/2512.22087)). Phase detection is complementary; this model can consume a phase signal as a hazard prior.
- **MemGPT.** Publishes the only complete threshold policy: warn, flush, evict ([paper](https://arxiv.org/abs/2310.08560)). Fixed thresholds are a special case of this model with constant value density.
- **Deployed harness defaults.** Claude Code and the OpenAI API compact near the window limit ([Claude Code](https://code.claude.com/docs/en/model-config.md), [OpenAI](https://developers.openai.com/api/docs/guides/compaction.md)). A high fixed threshold maximizes emergency compactions, which is the failure mode Propositions 3 and 4 target.
- **KV-cache eviction.** H2O and SnapKV select tokens under a budget ([H2O](https://arxiv.org/abs/2306.14048), [SnapKV](https://arxiv.org/abs/2404.14469)). Their heavy-hitter weighting is an intra-span analogue of the reuse hazard; this model keeps the span cut simple and defers intra-span selection.

## 14. Predictions and falsification

| ID | Prediction | Test |
|---|---|---|
| P1 | At equal token spend, the hazard policy retains more anchors than a fixed 80% threshold | Simulator sweep |
| P2 | Raising the fixed call cost `c_0` delays compaction; uniform token-price changes do not move the soft decision | Parameter sweep, Proposition 4 |
| P3 | The policy prevents forced overflow compactions in long sessions | Replay of long logs |
| P4 | Compaction frequency falls as `c_0` rises, with `T* ∝ √c_0` | Interval test |
| P5 | Generation penalty reduces repeated compaction of the same lineage | Trace inspection |

A failed prediction falsifies the corresponding assumption and requires an ADR amendment. P1 is the primary gate.

## 15. Defaults

| Parameter | Default | Rationale |
|---|---|---|
| `τ` | 12 turns | Typical coding-step reuse horizon |
| `β` | 0.98 | ≈ 50-turn effective horizon |
| `p` | 2 | Mild superlinear degradation |
| `θ_h` | 0 | Strict gain gate |
| `m` | 0.16·(W−R) | Matches shipped harness retention |
| `μ` | 0.25 | User price of savings |
| `γ` | 1.0 | Linear distortion in `1−ρ` |
| `d_min, d_max` | 0.15, 0.90 | Plausible summarizer floor and ceiling |
| `S_0` | 25,000 | Omission saturation span |
| `φ_max` | goal 1.0, constraint 0.98, decision 0.95, error 0.98, file 0.90, tool 0.75, chatter 0.95 | Detail-bearing units lose more; see Section 6.3 |
| `degradation` | price 0.05, exponent 2 | Load penalty priced against the window |
| `lossAversion` | 3 | Quality loss costs more than raw re-derivation |
| `qualityFloor` | 0.70 | Minimum operation fidelity for any compaction |
| `checkpointFloor` | 0.50 | Never fold a checkpoint below this fidelity |

Defaults are hypotheses. Calibration replaces them per model and per harness.

## 16. Limitations

- The hazard model assumes reuse decays with age. A session that revisits an old subsystem after a long gap violates A2.
- Anchor retention measures presence, not reasoning fidelity. A summary can name a fact and still misstate its role.
- Prices and window sizes are host inputs; wrong inputs give wrong decisions.
- The model has no semantic embedding by default. Lexical identifier overlap underestimates paraphrase reuse.
- `φ` is calibrated per summarizer model; a model change invalidates the curve.

## 17. Acceptance criteria

- **AC-1** `decide()` returns a decision for every state, including an empty or single-unit context.
- **AC-2** `Γ` equals the sum of reported terms within `1e-9` relative error.
- **AC-3** A forced-pressure state always returns `compact` with `urgency = hard`.
- **AC-4** Raising `λ` never advances the soft compaction turn in a stationary sweep.
- **AC-5** `T*_econ` matches `sqrt(2c_0/(λρg))` within `1e-6` relative error.
- **AC-6** `ARS` is deterministic for the same input pair.
- **AC-7** The policy never selects a cut that splits a tool call from its result.
- **AC-8** Core evaluation allocates no network access and no runtime dependency.
- **AC-9** No candidate below `qualityFloor` is selected.
- **AC-10** A checkpoint below `checkpointFloor` is never folded into a new summary.

## 18. Simulation evidence

A seeded simulator compares four policies on 20 sessions of 100 turns with a 200,000-token window. It uses latent reuse hazards and a pessimistic ground-truth fidelity curve, both hidden from the policy. Full method and caveats are in the [simulation run report](../qa/runs/2026-10-29-simulation.md).

| Policy | Tokens (M) | Needs satisfied | Lost needs | Compactions |
|---|---|---|---|---|
| Never compact | 13.54 | 97.38% | 2.2 | 5.3 |
| Fixed threshold 0.80 | 11.93 | 96.85% | 2.6 | 9.8 |
| Periodic 15 turns | 12.94 | 96.91% | 2.6 | 7.7 |
| Hazard, defaults | 4.50 | 83.16% | 14.2 | 30.6 |
| Hazard, quality floor 0.95 | 12.16 | 95.00% | 4.2 | 15.2 |

Reading: the default policy trades 13.7 points of need coverage for a 62% token reduction. The quality-first profile recovers most coverage at no token advantage over the fixed baseline. The frontier is the deliverable, not a single setting. Need coverage is not task success, so the next gate is a SWE-bench-style evaluation.
