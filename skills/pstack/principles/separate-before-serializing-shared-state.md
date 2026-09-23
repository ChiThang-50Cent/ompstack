---
name: pstack-principle-separate-before-serializing-shared-state
description: Separate Before Serializing Shared State. Use when concurrent actors may write the same file, branch, key, or object.
---
# Separate Before Serializing Shared State

**Trigger:** Use when concurrent actors may write the same file, branch, key, or object.

First eliminate unnecessary sharing through ownership partitioning, isolated worktrees, immutable artifacts, or single-writer synthesis. Locks and queues are second choices when sharing is intrinsic. Serialization around a confused ownership model only hides the design problem.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
