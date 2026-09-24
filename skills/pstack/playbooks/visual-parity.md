---
name: pstack-visual-parity
description: Preserve pixel-exact equivalence across a UI migration by freezing a screenshot baseline, changing one component at a time, and proving zero image diff on the matching surface.
---

# Visual parity

The baseline is the specification. Do not touch it. Equivalence is verified by image diff, not by visual confidence.

1. Establish the baseline before migration. Build or locate a visual regression harness that screenshots the current component across its relevant states. If two implementations are compared, capture both through the same surface. No baseline means no parity claim.
2. Hold anti-shortcut rules. Do not modify the harness or baseline. Do not restructure the component merely to make a diff pass. If the baseline appears wrong, stop and ask the operator rather than editing it.
3. Migrate one component at a time. Shared primitives migrate first as a blocking phase. Parallelize only across separate worktrees or artifacts, one owner per component.
4. Verify each component against its baseline on the matching UI surface. Use the Eval `browser` prelude when enabled, or the project's verification driver. A nonzero image diff is a failure. Investigate the pixel delta. Do not replace a missing screenshot with an eye-check.
5. Run the repository PR workflow for each component or safe batch after the diff is zero.

## Reply

Return components migrated, the exact diff result for each, baseline and harness locations, states exercised, remaining components, and any limitation that prevented live image proof. A zero diff claim requires the baseline artifact and the command or surface that produced it.
