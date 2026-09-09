# Risk routing

Select the lowest level that gives enough confidence, based on the confirmed mutation target and its semantics—not the reported symptom, expected diff size, or first plausible file.

## Risk scan before final classification

Select the primary workflow from task intent first. Before selecting final risk, write ownership, or independent evidence for any non-Low write task, inspect the target directly. Use `scout` only when this mapping is genuinely broad or the target remains unknown.

Record:
- mutation target and source evidence
- semantic boundary: local implementation, shared normalization/parser/serializer/compiler/cache/fallback, public API, or security
- consumer families and execution modes
- invariants that must remain true
- graph/reference traversal or code generation behavior
- material unknowns after direct inspection

Final Medium requires source evidence that the target is local, has one bounded consumer family and execution mode, has no shared semantic boundary or graph traversal, and has no material unknown.

Unresolved material uncertainty after direct inspection escalates to High. It never justifies retaining Medium.

## Low

Typical examples:
- documentation or comments
- mechanical rename with strong compiler coverage
- tiny isolated presentation change
- generated metadata with a deterministic generator/check

Default:
- parent implements
- run deterministic gate
- no subagent review unless uncertainty appears

## Medium

Use only after the risk scan establishes a bounded local target.

Typical examples:
- normal business-logic feature
- localized bug fix
- small API behavior change
- refactor with contained blast radius

Default:
- parent or one `task` worker implements
- deterministic gates
- one independent lane: `reviewer` for code correctness OR `ompstack-verifier` when runtime behavior is more important

Use both only when the change has enough surface area to justify it.

## High

High predicates:
- shared validation normalization, parser, serializer, compiler, code generator, cache policy, or fallback policy
- multiple execution modes for the changed behavior
- schema, AST, reference, or recursive graph traversal
- persistence, public API compatibility, concurrency, or async ordering
- cross-module refactor
- difficult regression with uncertain root cause
- material uncertainty after direct inspection

Default:
- `scout` only if discovery is broad
- `ompstack-architect` if there are meaningful design alternatives
- one owner per implementation lane using built-in `task`
- deterministic gates after fan-in
- `reviewer` + `ompstack-verifier` as independent evidence
- add `security-reviewer` only if the change crosses a security boundary

## Critical

Typical examples:
- authn/authz or permission enforcement
- cryptographic/key/secrets handling
- destructive migration or irreversible data path
- money movement or billing correctness
- sandbox/tenant isolation
- externally exposed parser/input path with high impact

Default:
- High-risk workflow
- explicitly include `security-reviewer` when security-relevant
- require concrete runtime/reproduction evidence where feasible
- use an additional architecture comparison only when design uncertainty remains; do not duplicate reviewers merely for ceremony

## Reclassification

Reclassify immediately when discovery, implementation, or a finding reveals a new consumer family or execution mode, graph traversal, fallback semantics, compatibility behavior, concurrency, or material uncertainty.

A Medium-to-High reclassification adds both `reviewer` and `ompstack-verifier` before closeout. Existing verdicts remain valid only for the code and assumptions they actually inspected.
