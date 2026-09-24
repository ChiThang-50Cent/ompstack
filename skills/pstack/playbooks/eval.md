---
name: pstack-eval
description: Design a blinded, reproducible experiment for competing variants, run isolated OMP candidates, judge sanitized outputs under one frozen rubric, and synthesize a recommendation.
---

# Eval playbook

You own experiment design. Plan, blind, run, synthesize, and report. Use this for a controlled comparison of variants, not for an ordinary test run or a single implementation.

## Blinding contract

- Do not put `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, or `arena` in a directory, filename, or prompt visible to a worker. Give the worker an organic user request that states the goal, not what is measured.
- Do not ask a worker to list skills, principles, files, or chain-of-thought. Ask for ordinary design notes and grade workflow from artifacts and transcript reads.
- Sanitize worktree and slug names with project-shaped names. Do not tell one worker that another worker exists.
- The judge may know it is judging, but sees sanitized labels only, never model identity.
- When comparing variants, one judge scores all outputs in one pass on one scale.

## Procedure

### 1. Frame

State the variant under test and the behavior that counts as success. Write a 3-6 criterion weighted rubric for the judge and keep it out of worker prompts. Freeze inputs, environment, candidate budget, and acceptance.

### 2. Set up isolated environments

Create one worktree or artifact directory per worker. Place only the project skeleton and context an organic task would expose. With OMP, use `task` isolation settings when available and report whether isolation was actually enabled. Never let a worker write the parent artifact.

### 3. Write one organic prompt

Describe the goal, constraints, relevant inputs, and required deliverable. Remove experiment vocabulary and chain-eliciting cues. Use identical core wording for every worker.

### 4. Run candidates in parallel

Dispatch one OMP `task` batch with one bounded worker per variant and a frozen prompt. Each worker returns its artifact and reproducible evidence. Do not rely on a worker's self-report. Keep labels sanitized and writer workspaces disjoint.

### 5. Run blinded judges

Use `pstack-judge` for the primary same-rubric judgment and `pstack-judge-b` as an independent cross-check when the task calls for it. Give each judge only sanitized labels, artifacts, evidence, the frozen objective, and rubric. Do not pass model names or author identities. A vote does not prove an empirical claim.

### 6. Verify the chain

Read every candidate transcript from the current-cwd OMP session bucket described in `docs/session.md`. Do not glob across unrelated projects. Inspect which files and skills each worker actually opened. Grade workflow from those reads and the artifact shape, never from a worker's claims. Read every candidate output end to end.

### 7. Synthesize

Compare the parent review with the judge results. Explain disagreements as rubric ambiguity, missing evidence, or reviewer bias. If one variant is promoted, record the recommendation and the evidence. If synthesis creates a new artifact, compute a new fingerprint and verify that artifact independently. Candidate verdicts never transfer to the synthesized artifact.

## Reply

Return the variant under test, frozen rubric, per-candidate notes, judge and cross-check verdicts, synthesis, unresolved limitations, and the promotion recommendation. Name worktree and evidence paths. State plainly when a result is inconclusive. This playbook produces a decision and evidence, not an automatic production change.
