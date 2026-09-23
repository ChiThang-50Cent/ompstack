---
name: pstack-principle-laziness-protocol
description: Laziness Protocol. Use while sizing a diff, refactoring, or feeling tempted to add layers.
---
# Laziness Protocol

**Trigger:** Use while sizing a diff, refactoring, or feeling tempted to add layers.

List what can be deleted, reused, or left unchanged. Choose the smallest coherent change that satisfies acceptance. A smaller surface reduces bugs, reader load, and verification cost. “Lazy” means refusing unnecessary work, not skipping evidence or correctness.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
