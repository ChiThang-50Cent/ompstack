---
name: pstack-principle-make-operations-idempotent
description: Make Operations Idempotent. Use for commands, migrations, retries, queues, and lifecycle hooks.
---
# Make Operations Idempotent

**Trigger:** Use for commands, migrations, retries, queues, and lifecycle hooks.

Design repeated execution to converge on the same correct state. Record checkpoints and stable identities; distinguish create/update/complete states. Test crash/retry boundaries. Idempotency does not mean swallowing errors—it means safe, observable repetition.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
