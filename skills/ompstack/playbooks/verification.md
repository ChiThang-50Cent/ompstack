# Verification phase

Apply this phase after the primary workflow, or with Investigation for a standalone read-only verification request. Verification is evidence about the current state, not a permanent badge or a replacement primary route.

## Order

1. Resolve a matching project-native `verify-<surface>` capability or an existing repository proof surface.
2. Fan in implementation work.
3. Run the capability's Doctor before its first drive and after a surprising drive. `DOCTOR: BLOCKED` is a verification blocker, not a product verdict.
4. Run deterministic gates.
5. Drive the closest real proof surface and preserve the named evidence through cleanup.
6. Only after deterministic evidence is available, spend tokens on independent model review.
7. Triage findings and fix accepted issues.
8. Rerun affected Doctor, gates, drives, and review evidence after behavior-changing fixes.
9. For autonomous, multi-phase, high-risk, or handoff work, audit a proportional `skill://ompstack-decision-trail`.

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

For every behavior-affecting change, use the closest available real proof surface: a project-native verification skill when one matches, otherwise a browser UI flow, CLI/TUI interaction, API consumer, migration replay, or equivalent runtime behavior. Tests, typechecks, and builds support the claim but do not replace that surface. If it cannot be exercised, report the exact gap as `BLOCKED` or unverified.

### Bundled reviewer

Use `reviewer` for patch-introduced correctness problems, edge cases, regressions, and diff-grounded reasoning. It is independent and read-only.

### Behavioral verifier

Use `ompstack-verifier` when correctness depends on executing a command, reproduction, service endpoint, integration test, browser flow through Eval, or another real surface. When a matching project verification skill exists, run its Doctor and Drive instructions rather than inventing a competing harness. It is a trusted agent instructed not to edit; Bash and Eval are not a write sandbox. If the required surface is unavailable, require `BLOCKED` instead of accepting weaker evidence.

The verifier's prose remains advisory. The external verification-contract runner and controller are optional unattended evidence adapters; use them only when a separately owned contract and evidence directory are required. A fresh `VERIFIED` oracle result can support that use case, but it does not replace ordinary project verification capability.

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
