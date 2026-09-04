# Feature workflow

Use this for new or intentionally changed behavior. A structural-only request belongs to Refactoring; a reproduced defect belongs to Bug fix.

## 1. Establish contracts

State the observable behavior being added or changed. Before parallel work, decide the shared contracts: types, API shape, persistence semantics, ownership boundaries, compatibility constraints, and the data shape that should organize the new logic.

## 2. Inspect before architecting

Skip architecture ceremony for an obvious local extension.

Use `ompstack-architect` when:
- at least two materially different designs are plausible
- the change crosses subsystem boundaries
- migration/compatibility is non-trivial
- the wrong shape would make later work expensive

For a contested high-risk design, submit up to two `ompstack-architect` tasks in a design-only `tasks[]` batch with the same context and decision criteria. Wait for those blocking results, select or synthesize the contract, then start a separate implementation batch.

## 3. Implement with bounded lanes

Prefer one write lane. Use a batch only when there are genuinely independent deliverables or a clear contract allows parallel changes.

For implementation tasks, omit `agent` and let OhMyPi use its bundled `task` worker.

Workers should investigate and edit in one pass when practical. Avoid a separate scout pass when filenames/runtime path are already known.

## 4. Fan in before broad validation

After implementation lanes finish:
- inspect the combined diff
- resolve contract mismatches
- run formatter/lint/typecheck/build/test once at the parent where appropriate
- run targeted behavior checks

## 5. Verify by risk

Use the risk-routing table. Prefer independent evidence over duplicate opinions.

A useful high-risk pair is:
- bundled `reviewer`: static/diff correctness review
- `ompstack-verifier`: execute the target behavior/test surface

Add bundled `security-reviewer` only when the feature changes a security boundary.
