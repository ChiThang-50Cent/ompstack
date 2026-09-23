---
name: pstack-principle-minimize-reader-load
description: Minimize Reader Load. Use when code is hard to trace or review.
---
# Minimize Reader Load

**Trigger:** Use when code is hard to trace or review.

Reduce layers, hidden state, indirection, and mutable scope. Collapse one-caller wrappers that add no semantic boundary. Put decisions near the data they govern. Optimize for the next reader’s ability to predict behavior, not for abstract elegance.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
