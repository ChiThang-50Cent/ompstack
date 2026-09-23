---
name: pstack-arena
description: Generate isolated competing designs or implementations, judge them under one frozen rubric, synthesize one coherent artifact, then verify it.
---
# Arena playbook

Generate isolated competing designs or implementations, judge them under one frozen rubric, synthesize one coherent artifact, then verify it.

**When to use:** Use when alternatives are genuinely open and the cost of a wrong choice justifies multiple candidates.

## Procedure

### 1. Frame

- Freeze objective, constraints, interfaces, acceptance, candidate budget, and 3-6 weighted rubric criteria.
- Define what evidence can discriminate candidates.
- Do not use arena for trivial or already-settled tasks.

### 2. Fan out

- Dispatch candidates with identical core prompt and independent isolated worktrees/artifacts.
- Set apply=false when using Workflowz/eval so candidates cannot mutate the main tree.
- Candidates must return actual artifacts plus evidence, not proposals only.

### 3. Cross-check

- Run focused checks on each candidate under the same environment.
- Blind labels/author identity where practical.
- Reject candidates that violate hard constraints before scoring.

### 4. Judge

- Use pstack-judge to score every candidate under the frozen rubric.
- Select one base; specify bounded grafts from others.
- A majority preference cannot override failing runtime evidence.

### 5. Synthesize

- Use exactly one pstack-synthesizer in an isolated worktree.
- Integrate the base and approved grafts coherently; reject incompatible grafts explicitly.
- Inspect the final diff rather than assuming candidate proofs compose.

### 6. Verify final artifact

- Compute a new fingerprint after synthesis.
- Run review and real-surface verification on the final artifact.
- Candidate verdicts do not transfer to the synthesis.

## Agent topology

N isolated builders -> optional per-candidate checks -> blinded pstack-judge -> one isolated synthesizer -> reviewer/verifier.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

Candidates never auto-apply, rubric is frozen before judging, one coherent final artifact exists, and only the final fingerprint receives PASS.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
