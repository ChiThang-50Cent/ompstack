---
name: pstack-principle-migrate-callers-then-delete-legacy-apis
description: Migrate Callers Then Delete Legacy APIs. Use when replacing an internal API or representation.
---
# Migrate Callers Then Delete Legacy APIs

**Trigger:** Use when replacing an internal API or representation.

Inventory callers, introduce the target contract, migrate them in a controlled wave, verify each boundary, then remove the old path. Avoid indefinite dual APIs and ambiguous ownership. If external compatibility requires a window, define its deadline and telemetry.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
