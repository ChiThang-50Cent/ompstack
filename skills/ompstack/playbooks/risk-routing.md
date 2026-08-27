# Risk routing

Use the lowest level that still gives enough confidence.

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

Typical examples:
- shared domain/core logic
- persistence or schema behavior
- concurrency/async ordering
- public API compatibility
- cross-module refactor
- difficult regression with uncertain root cause

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

## Escalation triggers

Escalate one level when any of these occur:
- affected files/runtime path remain unclear after direct inspection
- the first implementation attempt changes substantially more code than expected
- deterministic tests disagree with the expected behavior
- a reviewer identifies a plausible cross-boundary effect
- the fix requires migration, compatibility behavior, or concurrency reasoning
- the user explicitly asks for rigorous or multi-agent verification
