# Verification workflow

Verification is evidence about the current state, not a permanent badge.

## Order

1. Fan in implementation work.
2. Run deterministic gates first.
3. Only after those pass, spend tokens on independent model review.
4. Triage findings and fix accepted issues.
5. Rerun affected evidence after behavior-changing fixes.

## Verification lanes

### Deterministic gates

Examples:
- original bug reproduction
- targeted unit/integration tests
- typecheck/compiler
- lint or formatter check
- build
- schema/migration validation

Choose the narrowest commands that prove the relevant property. Do not run expensive project-wide commands without a reason.

For every behavior-affecting change, name the closest available real proof surface before claiming success: a browser UI flow, CLI/TUI interaction, API consumer, migration replay, or equivalent runtime behavior. Tests, typechecks, and builds support the claim but do not replace that surface. If it cannot be exercised, report the gap as unverified.

### Bundled reviewer

Use `reviewer` for patch-introduced correctness problems, edge cases, regressions, and diff-grounded reasoning. It is independent and read-only.

### Behavioral verifier

Use `ompstack-verifier` when correctness depends on executing a command, reproduction, service endpoint, integration test, or other real surface. It may execute tests/commands but must not edit.

### Security reviewer

Use bundled `security-reviewer` when the changed behavior meaningfully touches permissions, authn/authz, secrets, untrusted input, isolation boundaries, cryptography, or another security-sensitive path.

## Verdict validity

A verifier/reviewer verdict applies to the code/diff it actually inspected. If accepted findings or later edits materially change that surface, treat the old verdict as stale and rerun only the affected lanes.

Do not rerun every reviewer after a docs-only or clearly irrelevant edit.

## Final report

Report:
- implementation scope
- exact deterministic evidence run
- independent review/verifier verdicts
- findings accepted/rejected and why
- remaining unverified surfaces or uncertainty
