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

## 3. Finalize risk from the mutation target

Before opening a write lane or selecting independent evidence, inspect the confirmed mutation target and record its semantic boundary, consumer families, execution modes, invariants, graph/reference behavior, and material unknowns. Do not classify a bug from its symptom or expected diff size.

Medium requires source evidence that the target is local and bounded. Shared normalization/parser/serializer/compiler/cache/fallback behavior, multiple execution modes, graph traversal, compatibility/concurrency behavior, or material uncertainty require High.

## 4. Implement narrowly

Use the parent for a small local fix. Delegate to the default `task` worker when the change is substantial, naturally separable, or the parent should remain a coordinator.

Give the worker the reproduction, target path, known root-cause evidence, constraints, and acceptance criteria.

## 5. Prove with the same surface

After the fix, rerun the original failing reproduction when feasible. Passing unrelated tests is not a substitute for the original surface.

Then run the smallest relevant regression suite.

## 6. Avoid redundant verification

For a localized bug with a known proof surface:
- Rerun the original reproduction after each material change to the relevant source, dependency, test configuration, or environment.
- Once that reproduction passes, do not rerun the same command unless one of those inputs changes.
- If the distinct smallest relevant regression suite is still pending, run it next. Do not insert a static, broad, or project-wide gate unless the repository requires it.
- Do not invoke that regression suite again without a material change or a new failure that requires it.
- After both pass, proceed only to the independent evidence already selected by risk and to closeout. Do not add a project-wide lint, typecheck, build, or another broad suite solely for confidence.

This preserves the original proof surface; it does not justify skipping a repository-required completion gate or required independent evidence.

## 7. Independent verification

- Medium risk: use either `ompstack-verifier` or `reviewer`, whichever supplies evidence not already covered.
- High/Critical: use `reviewer` plus `ompstack-verifier`; add `security-reviewer` only when security-relevant.

If discovery or implementation changes the risk scan, reclassify before closeout. A Medium-to-High change requires both reviewer and verifier. If a finding causes a code change, rerun the original reproduction and any independent verdict whose assumptions could have changed.
