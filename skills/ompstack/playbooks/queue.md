# Queue and parallel-work workflow

Use this workflow when there are two or more work items that can make progress independently.

## Before spawning

Create one shared batch context using the preflight contract:

```text
# Goal
Observable behavior and proof surface.

# Constraints
Route, risk, repository constraints, and compatibility requirements.

# Contract
Each lane's writable and read-only files/symbols, one owner for every shared type/schema/API, parent integration ownership, fan-in order, and the one shared deterministic gate.
```

Each task must still be self-contained and use `# Target`, `# Change`, and `# Acceptance`.

## Implementation lanes

Use OhMyPi `tasks[]` batching. For general-purpose implementation lanes, omit `agent` so the bundled `task` worker is selected.

Do not repeat whole-project validation in every worker. Ask each worker only for narrow evidence needed to know its local work is coherent.

After all lanes return, the parent performs fan-in review and shared deterministic gates once.

## Isolation

Set `isolated: true` only when the current task schema exposes it, isolation is enabled, plan mode is off, and the repository/workflow benefits from a separate workspace. Isolated work returns a patch or branch result and is not revivable. Do not depend on isolation for correctness.

## Overlap

File overlap alone is not a reason to serialize everything. Define the shared contract first, assign exactly one owner to every shared write surface, then let the parent resolve integration after fan-in.

If the tasks are causally dependent, do not pretend they are parallel: complete the prerequisite first and pass its concrete result to the dependent task.

A blocking item waits inline, but non-blocking items in the same `tasks[]` call can start in parallel. Put architecture comparison and implementation in separate batches.
