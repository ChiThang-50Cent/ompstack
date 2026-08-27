# Bug-fix workflow

## 1. Reproduce first

Prefer a concrete failing command, test, request, trace, or UI flow. If reproduction is impossible, state the missing evidence and gather the smallest discriminating evidence before editing.

A bug that cannot be reproduced can still be investigated, but do not claim it is fixed without equivalent proof.

## 2. Find the runtime path

If the path is obvious, inspect it directly. Use bundled `scout` only when the relevant code is genuinely unknown or spans a broad codebase.

Separate:
- observed symptom
- likely path
- hypotheses
- evidence that distinguishes those hypotheses

## 3. Implement narrowly

Use the parent for a small local fix. Delegate to the default `task` worker when the change is substantial, naturally separable, or the parent should remain a coordinator.

Give the worker the reproduction, target path, known root-cause evidence, constraints, and acceptance criteria.

## 4. Prove with the same surface

After the fix, rerun the original failing reproduction when feasible. Passing unrelated tests is not a substitute for the original surface.

Then run the smallest relevant regression suite.

## 5. Independent verification

- Medium risk: use either `ompstack-verifier` or `reviewer`, whichever supplies evidence not already covered.
- High/Critical: use `reviewer` plus `ompstack-verifier`; add `security-reviewer` only when security-relevant.

If a finding causes a code change, rerun the original reproduction and any independent verdict whose assumptions could have changed.
