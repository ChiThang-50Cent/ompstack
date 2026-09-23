---
name: pstack-principle-sequence-verifiable-units
description: Sequence Work into Verifiable Units. Use for multi-step work, migrations, sweeps, and stacked delivery.
---
# Sequence Work into Verifiable Units

**Trigger:** Use for multi-step work, migrations, sweeps, and stacked delivery.

Break work into small coherent units that each end with an observable check. Order dependencies so evidence from earlier units supports later ones. Do not let a later PASS leapfrog an unverified foundation. Keep commits/PRs aligned with reviewable invariants.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
