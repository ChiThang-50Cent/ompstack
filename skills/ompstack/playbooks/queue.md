# Queue and parallel-work overlay

Apply this overlay after selecting the primary workflow when there are two or more work items that can make progress independently. Queue is execution topology, not a replacement primary route.

## Before spawning

Use the canonical preflight contract in `skill://ompstack`. Extend its `# Contract` section with:

- each lane's writable and read-only files or symbols
- one owner for every shared type, schema, or API
- the parent as integration owner
- fan-in order
- one shared deterministic gate

Each task must still be self-contained and use `# Target`, `# Change`, and `# Acceptance`.

## Implementation lanes

Use OhMyPi `tasks[]` batching. For general-purpose implementation lanes, omit `agent` so the bundled `task` worker is selected.

Do not repeat whole-project validation in every worker. Ask each worker only for narrow evidence needed to know its local work is coherent.

Task jobs may finish asynchronously. Collect every required result through auto-delivery or `hub wait`, then read the relevant `agent://`, `history://`, or artifact payload before parent synthesis. The return of the `task` call is not proof that all lanes have fanned in.

After fan-in, the parent performs integration review and shared deterministic gates once.

## Isolation

Request `isolated: true` only when the current task schema exposes it and a separate workspace benefits the work. The runtime may also auto-isolate eligible tasks. Inspect task result metadata and the target worktree before integration; do not assume every isolated task only returns a patch or branch, and do not depend on isolation for correctness.

## Overlap

File overlap alone is not a reason to serialize everything. Define the shared contract first, assign exactly one owner to every shared write surface, then let the parent resolve integration after fan-in.

If tasks are causally dependent, do not pretend they are parallel: complete the prerequisite, collect its concrete result, and insert that result into the dependent batch context and task.

A blocking item waits inline, but non-blocking items in the same `tasks[]` call can start in parallel. Put architecture comparison and implementation in separate batches.
