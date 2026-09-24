---
name: pstack-no-comments
description: Spawn the Comment Sicko reviewer, act on accepted findings, and offer encodings for claimed constraints.
disable-model-invocation: true
---

# No comments

Spawn `pstack-comment-sicko` and act on accepted findings. Defer to its fresh perspective about comments, while keeping ownership of the parent diff and every code change.

## Scope

Use the caller's files or diff. If no scope is supplied, use the current diff against the base branch, normally `main`, including the working tree. The reviewer must report only comments inside that scope.

## Steps

1. Run one OMP `task` for `pstack-comment-sicko`. Pass the exact scope. Do not restate the review rules in the task.
2. Inspect the structured reviewer report and the diff. Reject application-code edits, scope escapes, exception-protected deletions, misstated `MUST KILL` reasons, and findings that treat intentional code as guilty. A keep survives only with proof that the comment describes something outside our control. Audit missed scoped lint and TypeScript suppressions. Correctness or safety suppressions remain actionable `delete` findings. Restore deletions only with an exact exception and scoped proof. Before accepting a thin `IMPORTANT` or `do not remove` keep, load `skill://pstack/operators/how.md` or `skill://pstack/operators/why.md` for the named symbol. If a delete is ambiguous, do not restore it. If a keep is refuted or remains ambiguous, delete it. Revert and rerun one rejected report with the failure named. Reject a second, report it open, and fail this skill.
3. Fix trivial accepted findings directly by deleting a dead path, dropping a parameter, or using the real API. If a fix needs a shape, run `skill://pstack/operators/architect.md` once for the accepted set and surrounding code. Stop at the sketch. The architect shapes; the coordinator implements.
4. Implement the smallest root-cause fix in scope. Remove every named workaround. If the root cause is out of scope, land the smallest in-scope fix and report the rest open. `skill://pstack/principles/fix-root-causes.md` and `skill://pstack/principles/redesign-from-first-principles.md` guide intent only; neither authorizes widening the fence or fixing instances outside it. Never bolt on symptom guards.
5. Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps only for constraints we cannot change. Offer the cheapest in-scope type, runtime, test, or CI lint. Wait for interactive approval. In unattended or evaluation work, require caller pre-approval. If approved, encode the constraint and delete the comment. Otherwise delete it, report the constraint open, and sketch the out-of-scope work.
6. Report the deletion count, restored comments, reruns, architect sketch, fixes, encoding offers, encodings, unenforced constraints, and other open work.

The reviewer is report-only. It never edits application files. The parent decides which `delete`, `keep`, or `rewrite` findings are accepted and owns the resulting artifact fingerprint.
