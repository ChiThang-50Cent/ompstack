# Queue and parallel-work workflow

Use this workflow when there are two or more work items that can make progress independently.

## Before spawning

Create one shared batch context containing:
- overall goal
- repository constraints
- cross-task contracts
- dependencies already decided
- files or surfaces that must remain compatible

Each task must still be self-contained and use `# Target`, `# Change`, and `# Acceptance`.

## Implementation lanes

Use OhMyPi `tasks[]` batching. For general-purpose implementation lanes, omit `agent` so the bundled `task` worker is selected.

Do not repeat whole-project validation in every worker. Ask each worker only for narrow evidence needed to know its local work is coherent.

After all lanes return, the parent performs fan-in review and shared deterministic gates once.

## Isolation

Set `isolated: true` only if that field is available in the current OhMyPi task schema and the repository/workflow benefits from independent workspaces. Do not depend on isolation for correctness unless the runtime confirms it is active.

## Overlap

File overlap alone is not a reason to serialize everything. Define the shared contract first, keep ownership clear, then let the parent resolve integration after fan-in.

If the tasks are causally dependent, do not pretend they are parallel: complete the prerequisite first and pass its concrete result to the dependent task.
