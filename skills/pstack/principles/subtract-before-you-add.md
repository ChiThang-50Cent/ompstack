---
name: pstack-principle-subtract-before-you-add
description: Subtract Before You Add. Use before additions, rewrites, or structural migrations.
---
# Subtract Before You Add

**Trigger:** Use before additions, rewrites, or structural migrations.

Remove dead paths, obsolete flags, duplicate wrappers, and unused compatibility before building on top. A simpler base makes the target design visible and reduces dual-state transitions. Never delete without characterization and caller inventory.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
