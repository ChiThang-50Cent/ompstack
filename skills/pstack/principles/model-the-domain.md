---
name: pstack-principle-model-the-domain
description: Model the Domain. Use for stateful logic, repeated shape assumptions, or branch-heavy code.
---
# Model the Domain

**Trigger:** Use for stateful logic, repeated shape assumptions, or branch-heavy code.

Represent the domain explicitly with the right types, states, tables, registries, reducers, or collections. Put invariants where the data is created and transformed. Scattered conditionals are often a missing model. Keep the model no larger than the domain requires.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
