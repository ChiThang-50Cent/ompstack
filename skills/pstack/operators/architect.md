# Operator: Architecture before implementation

Use when code crosses a function/module/service boundary, introduces state, or changes ownership.

## Required sketch

- problem and non-goals;
- domain objects/types/states;
- owner of every mutable value;
- invariants and illegal states;
- boundaries, parsing/validation, errors, retries, and idempotency;
- alternative designs and tradeoffs;
- migration/caller plan;
- implementation slices and verification surface.

Dispatch `pstack-architect` with current-system evidence. If observable uncertainty separates alternatives, prototype it. If implementation exposes a false premise, stop and revise the design rather than layering guards onto the sketch.
