---
name: pstack-principle-fix-root-causes
description: Fix Root Causes. Use while debugging.
---
# Fix Root Causes

**Trigger:** Use while debugging.

Reproduce first, trace backwards from symptom to the earliest violated invariant, and test competing hypotheses. Repair the ownership, lifecycle, data, or boundary defect rather than adding symptom guards. Verify the original path and adjacent cases to show the cause—not only one manifestation—is fixed.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
