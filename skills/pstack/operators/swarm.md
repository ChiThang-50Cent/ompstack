# Operator: Swarm for coverage, not chaos

Use parallel agents for independent evidence partitions or disjoint artifacts.

## Before spawning

Create a coverage matrix with rows as questions/artifacts and columns as owners, inputs, output schema, done predicate, and evidence. Eliminate overlap in mutable ownership. Give each worker a file or artifact pointer rather than dumping raw content into the parent context.

## Safe uses

- codebase subsystems or history sources;
- independent hypotheses;
- platform/environment checks;
- disjoint implementation slices in isolated worktrees;
- test/benchmark matrix partitions.

## Unsafe uses

- multiple writers to the same file/branch/state;
- workers making incompatible architecture decisions;
- vague tasks whose results cannot be reconciled;
- fan-out before the objective and rubric are frozen.

The coordinator drains results, reads artifacts/diffs, resolves contradictions, and remains accountable.
