# spec(<area>): <short description>

> Lean-spec issue (one issue per epic). Body ≤ ~2000 tokens.

## Overview

<!-- BLUF: <=5 lines, conclusion first, no preamble. -->
TL;DR: <one-sentence outcome + why it matters> (spec §N or link).

- <second line: scope in one line>
- <third line: what becomes redundant or stays unchanged>

Problem and motivation detail, if any, follows the BLUF — never precedes it.

## Design

Intent-level approach: data flow, contracts touched, architecture seams.
Reference the governing spec section and relevant ADRs — do not repeat them.

Normative requirements use uppercase RFC 2119 keywords (MUST / SHOULD / MAY);
lowercase forms carry no weight, per RFC 8174. Use the keywords only here and
on allowlisted pages — see `docs/standards/writing-guide.md`. Every other
bullet is descriptive: write lowercase "must/should/may" or reword.

## Plan
- [ ] Deliverable 1 (independently verifiable)
- [ ] Deliverable 2

## Test
- [ ] Verification per plan item
- [ ] Eval gate (if retrieval/LLM behavior changes): which threshold

## Alignment
### Human decides
- [ ] (items crossing a named boundary — else leave empty)

### AI implements
- [ ] everything else, with the call stated

### Open questions
> Blocking items only; resolve in comments.

---
Labels: `spec`, `feat`, `area:<epic>`, `priority:<low|medium|high|critical>`
