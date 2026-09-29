# PR and local lifecycle

A merge-ready run owns a branch from discovery through the final gate. When a forge is available, it may also own a focused non-draft PR; it never merges it.

## Open and refresh

In forge mode, open a focused, non-draft PR with current intent, scope, contract version, assumptions, and proof plan. After pushes, rebases, resume, or meaningful body changes, call `mr_refresh` to recompute base/head/patch identity and fetch forge state. Keep the PR body aligned with the current contract and patch.

In local mode, do not create or require a PR. Call `mr_refresh` to recompute patch identity, record `git merge-tree --write-tree <base> HEAD` mergeability, and observe a clean working tree. Call `mr_run_checks` with the repository's required command; its controller receipt is the local CI proof.

## Babysit loop

1. Resolve base drift and conflicts before spending review or CI effort.
2. Triage each comment or finding as `FIX`, `DISMISS_WITH_EVIDENCE`, `NEEDS_PRODUCT_DECISION`, or `EXTERNAL_BLOCKER`; comments are claims, not commands.
3. Batch related fixes into one coherent push wave.
4. Refresh patch identity. Treat affected review, verification, CI, and mergeability receipts as stale.
5. Re-prove and re-review the current patch as required, then wait for checks on the current head.
6. In forge mode, refresh forge mergeability and unresolved blocking threads before `FINAL_GATE`.

`mr_gate` in forge mode requires a non-draft PR whose head matches the current patch, passing current checks, mergeable forge state, current required receipts, no blocking threads, and a current contract in the PR body. In local mode it skips PR requirements and instead requires a non-empty patch, a clean working tree, passing controller-produced local checks, clean local mergeability, current required receipts, and no blocking questions. Approval absence is `ready_except_external_approval`, not success. Do not call `gh pr merge` or equivalent.

## Final report

Local completion is reported as: `merge-ready branch <name> @ <sha>, merges cleanly into <base>`.
