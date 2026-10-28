# Writing Standard (STE profile)

This file is the **single home** for prose rules on this project. Templates and
checkers reference it; do not create a second writing guide.

## Rules

- Use the imperative mood. Start each instruction with a verb.
- Write one instruction per sentence. Do not chain two actions with "and".
- State the condition first: "If X, do Y." Never bury the condition after the action.
- Use active voice and name the actor. Use passive only when the actor is unknown.
- Keep sentences at 20 words or fewer. Explanations may run longer, but open them with the conclusion.
- Do not use contractions. Write "do not" in full; never shorten it.
- Name real files and interfaces by exact path. Never paraphrase a symbol name.
- Keep one term per concept. Use the glossary term; never a synonym.

## RFC 2119 keywords

Use uppercase MUST / SHOULD / MAY **only** on normative pages (this repo's
allowlist — see `docs-ops.json` → `rfc_allowlist`, typically specs, decisions,
and this guide). Lowercase forms carry no weight on those pages (RFC 8174).
Everywhere else write lowercase "must/should/may" or reword the sentence.

## BLUF

Lead every doc and issue body with the conclusion in ≤5 lines, then detail.
Never open with preamble or history.

## One home per fact

Before adding a table, list, or definition, link to the page that already owns
it. Duplicated facts drift; links do not.
