# Design and decomposition

Design is a separate phase from implementation. The root owns the final choice and records it in the contract or decision trail.

## Rigor

- LOW: one coherent design is sufficient when the change is localized and reversible.
- MEDIUM: state data shape, layer ownership, affected boundaries, compatibility, verification, and implementation slices.
- HIGH or contested: ask independent agents for structurally different candidates, not cosmetic variants. Freeze the same intent, contract, constraints, and required outputs for each candidate, then synthesize and record rejected alternatives.

## Safe handoff

Before fan-out, identify shared mutable files/state, integration ownership, and dependencies. Use the smallest safe decomposition; a single implementer is valid. Every implementer brief states exact scope, chosen design, owned files where known, relevant acceptance criteria, constraints, and the prohibition on changing semantics without escalation.

Architects should prefer read-only output. Writers must not concurrently edit the same files unless an explicit integration plan exists. Throwaway prototypes may answer empirical forks but must be discarded or clearly excluded from the shipped patch.
