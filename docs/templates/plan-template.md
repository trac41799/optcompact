# <Epic> Implementation Plan

> **For agentic workers:** Required sub-skill: subagent-driven-development
> or executing-plans to implement this plan task-by-task. Checkbox syntax.

**Goal:** one sentence
**Architecture:** 2-3 sentences
**Tech Stack:** key libraries
**Spec:** link to the spec issue + governing spec section

## Global Constraints
(exact values copied verbatim from the spec: version floors, naming rules,
selectors, wire contracts, forbidden-targets rules)

## Task 1: <independently testable deliverable>

**Files:** create / modify / test (exact paths)
**Interfaces:** consumes / produces (exact names)

- [ ] Write the failing test (actual code)
- [ ] Run it — verify it FAILS
- [ ] Minimal implementation (actual code)
- [ ] Run it — verify it PASSES
- [ ] Commit (conventional message)

## Task 2: ...

---
*Rules: one plan per epic at `docs/plans/YYYY-MM-DD-<epic-slug>.md` · bite-sized
red → green → refactor tasks · no placeholders (a step without real code means
the task is too vague — split it) · MRs that close the epic reference
`Closes #N` · style: `docs/standards/writing-guide.md`.*
