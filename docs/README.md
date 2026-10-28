# OptCompactMachine — Documentation Index

This is the single entry point for all project documentation. The structure follows the SDLC: **SDD → TDD planning → build → QA → review**. Architecture and decisions are maintained alongside the code.

## Structure

| Area | SDLC phase | Contents |
|---|---|---|
| [`specs/`](specs/) | **SDD** | Design contracts. Keep the build-ready source of truth first; per-epic lean specs live as tracker issues (template: [`templates/spec-issue-template.md`](templates/spec-issue-template.md)) |
| [`plans/`](plans/) | **TDD planning** | Implementation plans in the writing-plans format (bite-sized red → green → refactor tasks), one per epic |
| [`architecture/`](architecture/) | **Design** | Architecture docs, living API contract, mermaid diagrams, generated viewer/site if any |
| [`decisions/`](decisions/) | **Decision records** | ADRs — every significant decision, with context / decision / consequences |
| [`qa/`](qa/) | **QA** | Testing strategy, eval thresholds, run results (`qa/runs/`), UAT evidence (`qa/evidence/`) |
| [`reviews/`](reviews/) | **Review** | Grilling/audit artifacts — evidence behind spec & QA decisions |
| [`research/`](research/) | **Research** | Primary-source research notes feeding specs & reviews |
| [`changes/`](changes/) | **Change log** | Release/development change history |
| [`revisions/`](revisions/) | **Change record** | Per-change detailed tech + plain-English records |
| [`templates/`](templates/) | — | Reusable: ADR template, spec-issue template, plan template |
| [`standards/`](standards/) | **Writing standard** | Single home for prose rules (STE profile, RFC 2119 scope, BLUF) |

## How to navigate

- **New here?** Read the build-ready spec in `specs/` then `qa/` testing strategy.
- **Changing architecture?** Read the relevant ADR in `decisions/`, then follow `CONTRIBUTING.md`.
- **Implementing a feature?** Find its spec issue → read its plan in `plans/` → branch → TDD → MR.

## Docs lifecycle rules (see CONTRIBUTING.md)

- Every significant decision gets an ADR **before** code.
- Writing follows [`standards/writing-guide.md`](standards/writing-guide.md); templates already encode it.
- Every epic gets a spec issue + a plan in `plans/` **before** implementation.
- Generated diagram/site directories are regenerated from code, never hand-edited.
- Update `changes/CHANGELOG.md` with each merge that changes behavior.
