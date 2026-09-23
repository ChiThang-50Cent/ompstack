# Operator: Session pickup

Recover from persisted state before acting.

1. Read `pstack_status` and the active run audit directory.
2. Confirm objective, playbook, phase, acceptance, pending agents, latest evidence, decisions, verdict, and current fingerprint.
3. Compare current fingerprint to the latest verified fingerprint; mark any old verdict stale conceptually.
4. Inspect parent TODO and recent coherent commits/artifacts.
5. Identify the verified frontier and exactly one next unblocked unit.
6. Do not repeat completed work or rely solely on a prior prose summary.

If state is inconsistent, pause and repair provenance before new edits. Session pickup cannot revive work after OMP stopped unless an external runner actually exists.
