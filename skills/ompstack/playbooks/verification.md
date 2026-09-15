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

## Native Todo lifecycle

Apply these rules only when the parent selected `Progress tracking: native todo`:

1. Keep the shared proof item pending until every required implementation result has been collected and inspected.
2. When Doctor or a runtime prerequisite is unavailable, the parent calls `todo.block` with that exact prerequisite. This is blocked evidence, not a product `FAIL`.
3. When the prerequisite is available, the parent calls `todo.unblock`, then reruns Doctor before driving the surface.
4. When a behavior-changing patch invalidates a verdict, append a distinct rerun item before rerunning affected proof. Never reuse a completed verification item as fresh evidence.

## Proof-surface selection

Prefer a matching project-native `verify-<surface>` capability. Its Launch, Doctor, Drive, Evidence, and Cleanup instructions own the real-surface procedure. Without one, choose one closest driver:

| Change or claim | Drive | Evidence boundary |
| --- | --- | --- |
| Web user workflow | Use Browser through Eval; open an OMP-owned named tab, observe before interaction, then preserve a screenshot and observed state. Use `read` for static URLs. | Browser is an Eval prelude, not an independent agent tool. Relay/CDP acts on a user's session only with explicit authorization and a named target. |
| CLI or TUI behavior | Exercise the actual command or terminal path with its real arguments and environment. | Capture the exit status plus terminal output and the promised observable effect. |
| API or service behavior | Use the existing project verification capability or repository-owned consumer/client drive. | Capture the response and every promised side effect; a health check alone is not consumer proof. Do not create verification infrastructure unless the user extends scope. |
| Live state, race, or runtime mechanism | Use the native DAP debugger to launch/attach, then inspect a breakpoint, stack, scope, variable, or controlled state transition. | Preserve the observed runtime mechanism; source-only reasoning remains a hypothesis. |
| Symbol-preserving refactor | Use LSP references, rename, diagnostics, or code actions as appropriate. | LSP proves symbol migration only. Preserve and run the existing behavior pin or consumer drive separately. |

Record the selected driver, observable predicate, evidence location, and exact unavailable prerequisite before driving. If a required driver or runtime is unavailable, report `BLOCKED`; do not silently downgrade to a weaker proof.

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

### Change ledger

When a workflow uses `scripts/change-ledger.mjs`, generate its ledger from the declared base and head before independent review. A review lane MUST NOT close while its ledger has a `pending` entry. Each ledger entry ends as `reviewed` or `skipped`; every `skipped` entry records its reason.

### Requirement-reconstruction evidence

For a reconstruction-policy evaluation, preserve the raw-evidence locators, strict reconstruction/freeze artifacts, strict B reviewer envelopes, deterministic-gate output, and real proof-surface evidence for each run. Before accepting or scoring B findings, the parent validates `requirementReconstructionBReviewerEnvelopeV1` and confirms every finding `source_evidence` ID is declared by `reconstruction.evidence`; unbound findings are not evidence. A reconstruction map or reviewer opinion is not execution proof and MUST NOT override a failed deterministic gate, an unavailable required surface, or observed real execution evidence.

Score seeded omission recovery with deterministic SORR-strict from the corpus-declared eligible slots only. Do not scan raw evidence, transcripts, tool output, source snippets, or incidental mentions to claim recovery. Send neutral, arm-blind packets to the separate anchor-validity judge; its `VALID_EXPLICIT`, `VALID_DERIVED`, `REPO_INVARIANT`, or `UNSUPPORTED` labels assess finding support, not whether a requirement was recovered. `VALID_DERIVED` requires cited source evidence and a checkable derivation without a new product assumption.

Apply materiality and promotion decisions to paired family aggregates, not pooled reruns. Preserve family, domain-shifted twins, and all reruns together for paired uncertainty. Use the preregistered 3-to-5 rerun ladder only: a threshold-spanning interval at three reruns permits completing five reruns for every affected paired arm; at five, report `BORDERLINE` rather than continuing or promoting on that threshold. Report per-family SORR, unsupported blocking-finding rate, proof-surface execution, model/token/tool/test-reinvocation/wall-time cost, and uncertainty intervals alongside the underlying artifacts.

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
