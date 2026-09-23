---
name: pstack-principle-type-system-discipline
description: Type System Discipline. Use when designing types or signatures in a typed language.
---
# Type System Discipline

**Trigger:** Use when designing types or signatures in a typed language.

Make invalid states unrepresentable where practical. Distinguish semantically different primitives, encode required transitions, and parse optional/unknown external values once. Types should document ownership and invariants without creating generic machinery that obscures the domain.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
