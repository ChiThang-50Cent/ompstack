# Operator: Arena

Fan out N parallel attempts at the same task. Read every candidate end to end. Pick the strongest as the base. Graft the best ideas from the others into it. Verify the synthesized result.

## Start

Open a todolist with one entry per phase before launching anything:

1. Frame
2. Fan out
3. Cross-judge
4. Pick
5. Graft
6. Verify

## Phase A: Frame

The N candidates receive the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric. State what success looks like for this task, then turn it into 3-6 concrete gradeable criteria.
3. Set N from the user or derive it from the design space. N is total workers, not a concurrency limit.
4. Check the active OMP configuration before requesting isolation. `isolated: true` only has effect when `task.isolation.enabled` is enabled; if it is disabled or unknown, say so in the arena record and do not claim worktree isolation. Give each candidate a disjoint output path or artifact pointer as the fallback ownership boundary.
5. Freeze the candidate prompt, rubric, output paths, and selection rule before spawning.

## Phase B: Fan out

Spawn all N candidates in **one `task` batch**. Each candidate is a `pstack-builder` item with the same task, grounding artifact, rubric, and its own output path. Use `isolated: true` only after checking that OMP task isolation is enabled. If isolation is unavailable, keep the candidates' writes disjoint and record that the arena ran without OMP isolation. Each rationale names alternatives considered and rejected.

If a candidate fails to produce output, proceed with N-1 and note the dropout. Do not turn a dropout into a pass.

Candidate votes and candidate test runs do not transfer a PASS to the synthesized artifact. The final artifact is a new object: recompute its fingerprint, inspect its diff, and run the verification surface against the synthesis itself. If no candidate produced a usable artifact, stop with a blocked arena report rather than selecting an empty base, and preserve the judge's evidence for review before reporting completion.

## Phase C: Cross-judge

After every candidate is terminal, send one `pstack-judge` item through `task` with the rubric, candidate paths/labels, and the selection rule. The judge scores every criterion and recommends a base with rationale. It must not edit candidates or the synthesis.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion and compare against the judge. Agreement confirms the pick; disagreement means inspect the rubric and rationales rather than averaging blindly.

Pick the base a future maintainer can extend most easily without breaking invariants. Prefer the cleaner boundary or smaller API when two candidates tie. Record the pick and reason alongside the base artifact, including the judge's verdict.

## Phase E: Graft

Walk each losing candidate once more and identify what is worth porting into the base. The signal is usually one or two things per candidate, not most of it. Fold each graft into one coherent mental model; do not paste mechanically. Record what was grafted, from which candidate, and what was rejected and why.

When candidates converge on the same shape, note that agreement and ship the consensus shape. When they diverge wildly, Phase A was under-specified: reframe and rerun rather than averaging the divergence.

## Phase F: Verify

The synthesized artifact must hold up under the same scrutiny as any other output. If verification surfaces a problem the arena missed, either reframe and rerun or return to grafting after checking which candidate caught the issue.

## Outputs

One synthesized artifact and one short synthesis note naming the base, grafts, rejections, dropouts, isolation setting and observed effect, judge result, and verification result.
