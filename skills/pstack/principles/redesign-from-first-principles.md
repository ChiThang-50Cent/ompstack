---
name: pstack-principle-redesign-from-first-principles
description: Redesign from First Principles. Use when a new requirement conflicts with an existing design.
---
# Redesign from First Principles

**Trigger:** Use when a new requirement conflicts with an existing design.

Sketch the system as though the new requirement had existed from day one. Compare that target with the current system, then migrate toward it deliberately. Do not bolt another exception onto an architecture whose premise has changed.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
