# Clarification

Ask the operator only about choices that discovery cannot answer and that materially affect product, security, data, compatibility, or irreversible UX semantics.

## Decision test

For each unresolved decision:

1. Can repository, test, documentation, or history evidence answer it? Derive the answer and record the pointer.
2. Can a cheap, safe experiment answer it? Run the experiment and record the result.
3. Is the choice low-impact and reversible? Choose a conservative default and record an `assumption` decision.
4. Can a neutral design preserve optionality cheaply? Prefer it and record the tradeoff.
5. Otherwise, treat it as a blocking clarification candidate.

Do not ask which files to edit, which library to use, whether to add tests, or other engineering facts available from the repository.

## Asking

Wait until discovery is complete, then send one grouped, focused question containing:

- the established evidence and relevant pointers;
- why the remaining choice changes observable behavior;
- a small set of concrete options and their consequences;
- the safe default, if one exists.

Use `mr_contract` to record the user's answer as an immutable `source: "user"` decision. Record delegated choices as reversible assumptions. Never replace an explicit user decision with a derived default; if new evidence conflicts, stop and ask again.

When the question is blocking, the root must transition to `CLARIFICATION_REQUIRED` before asking and end the turn after the grouped question; only that phase permits a normal stop. Resume by recording the answer with `mr_contract`, resolving the question, and continuing the phase loop.
