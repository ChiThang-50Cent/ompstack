---
name: ompstack-maintain-verification
description: Audit and maintain an existing project-local verify-* OMP skill and its feature map through source evidence and live driving. Use for verification-harness drift, stale feature maps, or an explicit verification capability audit.
---

# Maintain an OMP-native verification capability

The unit of rigor is a user-facing feature. Keep the project verification capability honest without editing product code.

## Outcome

Choose exactly one outcome:

- `CLEAN` — source and live coverage completed; no correction worth shipping.
- `CHANGED` — a proven correction to the verification skill, feature map, or owned helper was made and re-driven.
- `BLOCKED` — coverage could not finish or a safe correction could not be proven; name the exact prerequisite.

## 1. Locate and bound the capability

Find the selected `.omp/skills/verify-<surface>/SKILL.md` and its `features/README.md`. If none exists, return `BLOCKED` and route to `skill://ompstack-create-verification`; do not invent a verification skill during a maintenance pass.

Write scope is limited to the selected verification skill, its feature-map files, and helpers it explicitly owns. Never edit product code, production configuration, tests, lockfiles, or external state to make a drive pass.

## 2. Reconcile source coverage

Read the feature index and feature files. For multiple independent features, use one read-only `scout` task per feature in a single OMP `tasks[]` batch. Each scout returns:

```text
feature summary
source entry points
likely map drift or none
one live-drive recipe
```

The parent reconciles the results, removes dead or duplicate map entries, and identifies user-facing source changes absent from the map. One narrow feature does not need fan-out.

## 3. Run the live pass

The parent owns driving. Follow the selected skill's launch model. Before the first drive, run Doctor and require `DOCTOR: READY`. Run Doctor again after any unexpected outcome.

For every selected feature:

1. Drive its user or consumer path.
2. Capture action and observable result.
3. Verify side effects the feature promises.
4. Preserve evidence through cleanup.

Reset to a known state or relaunch after a surprising drive. Do not continue against an instance whose Doctor is `BLOCKED`.

## 4. Triage without papering over defects

- Wrong user-POV map description or route → **documentation drift**. Correct the map and re-drive.
- Working product behavior that the harness cannot drive → **harness gap**. Correct only the owned helper/skill and re-drive.
- Broken application behavior → **product gap**. Preserve the smallest reproduction and report it. Do not change product code in this maintenance task.
- Missing credential, entitlement, service, tool, or safe setup path → **BLOCKED**. Record the route attempted and exact prerequisite.

For an autonomous, multi-phase, or high-risk maintenance pass, keep the material decisions in `skill://ompstack-decision-trail`.

## 5. Report

Report the outcome, features covered, source evidence, drives/evidence, corrections made, product gaps, unreachable prerequisites, and teardown status. A `CHANGED` outcome must identify the re-driven proof. A `BLOCKED` outcome must not imply product failure.
