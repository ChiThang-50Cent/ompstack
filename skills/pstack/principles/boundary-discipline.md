---
name: pstack-principle-boundary-discipline
description: Boundary Discipline. Use for validation, adapters, serialization, errors, and external systems.
---
# Boundary Discipline

**Trigger:** Use for validation, adapters, serialization, errors, and external systems.

Parse and validate untrusted data at the boundary, convert it into trusted internal types, and keep business logic free of transport/framework checks. Define error translation and ownership at the edge. Avoid duplicating guards deep inside already-trusted paths.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
