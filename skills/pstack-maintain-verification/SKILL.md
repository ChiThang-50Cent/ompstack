---
name: pstack-maintain-verification
description: Keep a project-local verification skill and its feature map honest through source review, live coverage, and proven bounded corrections.
disable-model-invocation: true
---

# Maintain a verification skill

A feature map rots when the product changes. This skill is the upkeep loop for a project-local skill created by `skill://pstack-create-verification`, or for any verification skill with a `features/` map. The unit of rigor is the feature, not every sentence. Cover every feature file from source and exercise every feature live without terminalizing every bullet.

## Outcomes

Pick one outcome and state which one:

- **clean:** every feature received source and live coverage, and nothing worth shipping changed. Do not create a branch or PR.
- **changed:** one bounded change ships proven documentation, harness, or map corrections.
- **blocked:** coverage could not finish or a proven fix could not ship safely. State the exact blocker.

## Edit scope

Edit only the verification skill's own directory. This includes its `SKILL.md`, `features/`, and harness scripts it owns. Never edit product code during this run. When the described behavior no longer exists, classify it as documentation drift and fix the map, or as a product regression and report it. Do not paper over a product regression in documentation.

## Pass

0. **Locate the target.** Find the project-local verification skill whose body has launch and drive sections and a feature map, usually `.omp/skills/verify-*/`. If several candidates exist, ask which one. If none exists, stop and point to `skill://pstack-create-verification` instead of inventing a target.

1. **Check the index.** Read the feature map `README.md` and list sibling files with `glob`. Fix missing, extra, duplicate, or dead entries. Keep this inventory lightweight. Do not generate a second inventory.

2. **Read source in one batch.** Create one OMP `task` batch with one read-only `pstack-scout` item per feature file. Each item explains how the user-facing feature works from source, cites entry points, flags likely documentation drift, and returns one concise live-verification recipe. Children do not drive the product and do not edit files. Require this result shape:

   - feature summary;
   - source entry points;
   - likely drift or `none`;
   - one live-verification recipe.

3. **Reconcile.** Require a returned summary for every feature. Merge overlapping recipes into as few application states as practical. Spot-check cited drift and do not re-prove clean claims. Sweep recent changes for user-facing surfaces missing from the map. Require a concrete source path before calling a surface missing.

4. **Run the live pass.** The coordinator owns all driving. Follow the verification skill's launch model. Use one long-lived instance driven serially for servers and UIs, or a fresh isolated session per drive for short-lived CLIs. Exercise every feature at least once.

   Hold these invariants through the whole pass:

   1. Never drive an instance that has not been health-checked since its last surprising event. Run the doctor before the first drive, on each fresh session when sessions are the unit, and again after any failed drive. When the doctor cannot see a wedged UI state on a healthy process, reset to a known state or relaunch instead of hoping.
   2. Evidence captured so far survives cleanup. Check it at the named location rather than assuming it survived.
   3. Nothing started by a drive outlives that drive's usefulness. Clean failed-iteration residue whether the session is stuck, exited, or shared. For a shared instance, clean residue without stopping the instance.

   A doctor failure caused by skill drift is drift. Fix it under edit scope and retry once. Restart whatever the fix invalidated and nothing more before calling the pass blocked. A feature that cannot be reached is `verified-unreachable` only with a concrete prerequisite, such as auth, entitlement, operating system, or external state, and the route attempted. If the map omits that prerequisite, classify it as drift. Any harness fix from triage must be driven live again before it ships. Perform final teardown after the last drive, including re-proofs. Evidence stays.

5. **Triage.** A wrong or missing user-facing description is documentation drift. Fix it. Working behavior the harness cannot drive is a harness gap. Fix it and keep helpers executable with documented invocation. Product behavior that is actually broken is a product gap. Record it for the user and keep it out of this change.

6. **Ship or stop.** For `changed`, ship one bounded change containing only proven corrections. Re-read every changed file before applying it. For `clean` or `blocked`, do not create a PR. Report the outcome and coverage honestly.

## Feature-change rule

When a feature changes, update the matching file in `features/` and the index if its entry point or summary changes. Update the project verification skill when launch, doctor, harness, evidence, cleanup, or limitations change. Re-run `npm run validate` or the project's documented `validate` command after every feature-map change, then re-run the affected mapped path live. Do not mark the maintenance pass complete from source review alone.

Keep concise run notes in a scratch location. Do not commit scratch notes. Record features covered, unreachable prerequisites, confirmed drift, commands, evidence references, and the selected outcome with parent-owned pstack tools.
