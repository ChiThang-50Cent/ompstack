---
name: merge-ready
description: "Control-plane methodology for turning operator intent into a verified, merge-ready branch or pull request without merging"
---

# Mission

Turn the operator's immutable intent into one merge-ready branch or pull request. A local repository without a forge is valid: prove the branch is complete, locally checked, conflict-free against its base, and clean. Do not merge, close, or ship it. The controller and its deterministic gate—not a model's confidence—decide when the run may finish.

# First principles

- Treat the prompt as intent, not a complete specification. Recover behavior from repository evidence before asking.
- Keep raw intent immutable. Record inferred behavior, assumptions, and user decisions in versioned contracts with provenance.
- Evidence must directly prove the claim on the current patch. Never count stale, failed, or inconclusive evidence.
- A reviewer is not a verifier: review asks whether the change is flawed; verification exercises requested behavior on the real surface.
- Never silently override an explicit user decision, lower rigor because work is difficult, or merge without separate explicit authorization.

# Phase loop

1. Call `mr_state`; inspect the active phase, `validTransitions`, `gate` (what is still missing), contract, patch, forge mode, receipts, and blockers. If the base branch is wrong (default is `origin/HEAD`), fix it early with `mr_contract` `op: "set_base"`; local refs are resolved to `origin/<base>` when present.
2. In `SPEC_DISCOVERY`, inspect product surfaces, invariants, analogous flows, tests, and history. Trace the root cause beyond the symptom and use `references/spec-discovery.md`.
3. Before contract readiness, enumerate sibling sites and build a behavior matrix with `inverse_direction`, `round_trip`, and `backward_compat` rows. Ask: “what else shares this root cause?”, “what is the inverse operation (parse↔serialize, read↔write, create↔delete)?”, and “does a round trip preserve meaning?”
4. Propose a contract with root-cause evidence, sibling-site decisions, and matrix rows; record any unresolved blocking `openQuestions` before asking for clarification. If a consequential choice remains unresolved, transition to `CLARIFICATION_REQUIRED`, ask one grouped question, and end the turn; stop is allowed only in this clarification phase. Otherwise answer everything available from the repository or a cheap experiment. Use `references/clarification.md`.
5. Use `mr_contract` to create/version the contract and record decisions. Do not enter `CONTRACT_READY` with unresolved blocking questions.
6. Classify rigor (LOW/MEDIUM/HIGH), then design and decompose with explicit ownership. The effective rigor floor may rise from sibling fixes or non-`n/a` inverse/round-trip behavior; satisfy the raised floor. Reviewers do not raise rigor.
7. Implement the bounded design. Use `mr_transition` for phase changes; never edit controller state files directly.
8. Prove each required acceptance criterion directly and register structured receipts with `mr_receipt`. Self-proof is not independent proof.
9. If a forge is available, open or update a non-draft PR and use `mr_refresh` to bind local patch and forge state. Without a forge, keep the run local: call `mr_refresh` for patch/merge-tree evidence and `mr_run_checks` for the required local command; no PR is needed.
10. Before review, call `mr_refresh` so the packet describes the current patch.
11. In forge mode, call `mr_review_packet` with its `contextPointers` and `rubricVersion` inputs; it computes the diff from the controller's current patch identity. Pass the returned packet path and digest verbatim to every replicated reviewer.
12. Run the code/security lanes required by the effective rigor; product review is required from MEDIUM. Record each review receipt with that returned `packetDigest`, a distinct `producer.id` (for example, `mr-code-reviewer-a`), and the lane's `producer.model`. MEDIUM requires two distinct reviewers; HIGH requires distinct reviewer models. A product review with non-empty `contractGaps` returns to `SPEC_DISCOVERY` for a new contract version. When a patch changes only to fix review findings, keep the contract version and re-run only the reviewers whose findings were fixed on a fresh packet; other passing code reviews of the same contract carry forward, and product review is re-run only after a contract change.
13. Run independent verification once, after reviews pass on the final patch, with a read/execute-only verifier. Record the result and evidence through the root session.
14. In `BABYSIT`, resolve conflicts/comments/CI failures, batch fixes, refresh, and repeat proof/review when patch-bound evidence is invalidated.
15. In `FINAL_GATE`, call `mr_gate`. Before `MERGE_READY`, `mr_transition` refreshes patch state (and forge state when present) automatically; continue until it reports `merge_ready` or a truthful terminal state (`BLOCKED_PRODUCT`, `BLOCKED_ENVIRONMENT`, `BLOCKED_EXTERNAL`, `INCONCLUSIVE`, or `ABORTED`). `ready_except_external_approval` is not `merge_ready`.

# Tool discipline

Use the controller tools as the source of truth:
Only the root/main session invokes mutating controller operations. Read-only subagents follow the root's packet and handoff; reviewers and verifiers must not call `mr_*` tools or edit controller state.

- `mr_state`: inspect current run, forge mode, contract, patch, and evidence summary.
- `mr_contract`: get/propose a contract version, record a decision, or resolve a question.
- `mr_receipt`: append patch/contract-bound proof; include concrete evidence pointers. CI and mergeability receipts come from controller scripts.
- `mr_gate`: inspect deterministic missing, stale, and failed requirements.
- `mr_run_checks`: run the repository's required local command and capture its output as a controller receipt.
- `mr_transition`: request only valid state-machine edges.
- `mr_refresh`: recompute patch identity, local mergeability, and working-tree state; fetch PR state only in forge mode.
- `mr_review_packet`: freeze the review artifact and produce its digest before replicated review in forge mode.

After any semantic patch change, refresh immediately and assume affected review, verification, CI, and mergeability evidence is stale until the gate says otherwise. Never claim green CI as behavioral proof. Never use `gh pr merge` or an equivalent merge command.

# Final report

For a local run, report exactly the verified outcome in this form: `merge-ready branch <name> @ <sha>, merges cleanly into <base>`. A hosted PR is optional; never imply a PR exists in local mode.

# Playbooks

- Discovery and questions: [spec-discovery](references/spec-discovery.md), [clarification](references/clarification.md)
- Change shape: [bug](references/bug.md), [feature](references/feature.md), [refactor](references/refactor.md), [design](references/design.md)
- Proof and review: [review](references/review.md), [verification](references/verification.md)
- PR lifecycle and rigor: [pr-lifecycle](references/pr-lifecycle.md), [risk](references/risk.md)
