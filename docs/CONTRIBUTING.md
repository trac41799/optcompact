# Documentation Conventions

How docs are maintained for the life of the project. Follow these rules on every change.

Prose rules (STE profile, RFC 2119 scope, BLUF) live in
[`standards/writing-guide.md`](standards/writing-guide.md). This file covers
hygiene and process; the guide covers wording.

## Principles

1. **One home per fact.** A fact lives in exactly one doc; everything else links to it. ADRs state decisions; specs state designs; plans state tasks. Generated layers (see below) are never a source of truth.
2. **Docs travel with code.** A change that alters behavior updates the relevant spec/ADR/changelog in the same MR.
3. **Decisions before code.** A significant decision gets an ADR first. This covers framework, contract, and architecture choices. Even a short ADR preserves the "why".
4. **Epics get specs + plans.** Every epic: a spec issue (see `templates/spec-issue-template.md`), then a plan in `plans/` (see `templates/plan-template.md`), then MRs that `Closes #N`.
5. **Specs state delivery status.** Every normative spec carries a Delivered-vs-Deferred table (with the governing issue/MR) and marks each unmet requirement inline. A spec is a *target*; the table stops it reading as if the target is already live.

## When to write what

| Change type | Required doc update |
|---|---|
| New behavior / feature | spec issue → `plans/<date>-<epic>.md` → `changes/CHANGELOG.md` |
| Architecture / framework / contract decision | New ADR in `decisions/ADR-####-<slug>.md` + update `specs/` if it describes design |
| API surface change | living API contract page + snapshot (CI-validated if the repo has one) |
| Test/eval threshold change | QA thresholds page + this MR's eval results under `qa/` |
| Methodological review / grilling pass | `reviews/` — findings + decisions triggered (before significant spec/QA changes) |
| Diagram change | Authored: edit the mermaid in its one authored home — never duplicate. Generated: edit the curated source and regenerate — never the output directory |
| Architecture suite / site change | Edit the annotation doc or site source, then regenerate; run the repo's docs-site guards |

## ADR format (see template)

Numbered sequentially (`ADR-0001-…`). Status: `Proposed → Accepted → Superseded`. Keep each ADR under ~400 words: Context / Decision / Consequences.

## Plan format (see templates/plan-template.md)

writing-plans style. The header carries Goal, Architecture, Tech Stack, a Spec link, and Global Constraints. Each task lists Files and Interfaces. Each task ticks write-failing-test, run-fail, minimal-impl, run-pass, then commit. No placeholders — a step without real code means the task is too vague.

## Doc hygiene

- Mermaid for diagrams (GitLab renders natively). Validate syntax before merge.
- No screenshots of code; no duplicated tables.
- Relative links between docs only (no absolute paths).
- ASCII wireframes OK in specs for UI; real screenshots land under `qa/` or `docs/` when they exist.
