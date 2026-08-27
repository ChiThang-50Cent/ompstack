# Prototype workflow

Use this to settle one empirical design, behavior, timing, or interaction decision cheaply. The prototype is a disposable instrument, not production code. The selected direction later routes to Feature or, for a material design shape, `ompstack-architect`.

## 1. Name one decision and observation

State the decision the prototype must resolve and what observable result decides it. If the desired behavior is already specified, route directly to Feature instead.

## 2. Choose the smallest disposable probe

Prefer a temporary directory, a confirmed isolated workspace, or a non-production example. Never treat task isolation as available until the current runtime confirms it.

Do not alter production source, add permanent abstractions, or write tests for the throwaway probe. If a safe disposable location is unavailable, report the limitation rather than using the production path as a scratchpad.

## 3. Compare only useful alternatives

Build one or a small number of alternatives that answer the decision. For a UI choice, make each variant identifiable. For behavior or timing, make inputs and observed output comparable.

## 4. Exercise the matching surface

Drive the actual surface that decides the question: browser UI interaction, CLI/TUI output, API response, runtime trace, or measured timing. Observation is the evidence; a compile or static review is not.

## 5. Hand off the decision

Report variants, observations, tradeoffs, and a recommendation. Clean up disposable artifacts unless the user explicitly asks to retain one. Do not promote prototype code directly into production.

## Reply

State that the artifact is disposable, where it was created, the observed evidence, and the recommended next route.