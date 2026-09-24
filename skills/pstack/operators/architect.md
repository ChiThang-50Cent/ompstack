# Operator: Architect

Design before implementing. Sketch types, function signatures, class shapes, and module boundaries with `not implemented` bodies and pseudocode. Synthesize across independent design candidates, then fill in code against the chosen sketch. If implementation proves the sketch wrong, throw it out and redesign.

## Start

Open a todolist with one entry per phase before starting:

1. Ground
2. Sketch
3. Agree
4. Implement
5. Scrap

## Phase A: Ground the problem

Build a real mental model of every system the new code touches. Run the `how` operator over relevant subsystems. Naming a file is not grounding: produce the traced model it prescribes. If the design redefines ownership or layering, also run the `why` operator on the existing shape so its rationale becomes a constraint rather than a guess.

Skip Phase A only when the work is genuinely greenfield with no surrounding system to integrate.

## Phase B: Sketch

Run the `arena` operator with the design-sketch task and Phase A grounding artifacts. Pass `skill://pstack/operators/references/architect/runner-prompt.md` to each runner. Each candidate produces a design package shaped by `skill://pstack/operators/references/architect/rationale-template.md`.

Use at least two structurally distinct candidates before synthesis, even when the first looks sufficient. Whole-shape alternatives, not point fixes inside one shape. Screen every candidate against `skill://pstack/operators/references/architect/design-red-flags.md` before synthesis: reject or revise shallow modules, information leakage, temporal decomposition, and pass-through methods.

Compare viable candidates on interface depth. Prefer the design that hides more complexity behind a smaller, simpler public surface. A rich interface can keep call chains short by concentrating capability instead of scattering it across layers. The arena returns one synthesized design package; record the synthesis decision in the rationale.

## Phase C: Agree (opt-in)

Default: proceed directly to implementation with the synthesized design. No human checkpoint.

Opt in to a checkpoint only when the invoker explicitly asks for one (for example, "architect with checkpoint" or "stop and show me before implementing"). Surface the synthesized design and pause for sign-off.

The synthesis can ship as its own commit either way, as the scaffold-first mode of foundational thinking. Planned and scoped breakage during fill-in is acceptable. For adversarial pressure on the design before implementation, run `interrogate` on the synthesized sketch.

If the human pushes back on the shape, treat that as Phase A evidence. Re-ground and re-run Phase B before writing more code.

## Phase D: Implement against the sketch

Replace `not implemented` bodies with code and pseudocode with logic. The synthesized sketch is the contract.

Deviations from the sketch are signal worth surfacing, not friction to absorb silently. If a function needs a parameter the sketch did not anticipate, ask whether the sketch was wrong, the requirement was missed, or the implementation is overreaching.

## Phase E: Scrap when the architecture is wrong

If implementation keeps producing friction the sketch cannot absorb, throw the sketch out. Do not bolt fixes onto a wrong design. The signal is a pattern, not a single instance:

- the same workaround shape appears across unrelated code;
- multiple edge cases need special-case branches;
- types need escape hatches (`any`, casts, optional fields always set in practice);
- the "we need a lock" reflex appears when the sketch said the state was not shared;
- callers must know the abstraction's internal rules;
- two or more independent implementation deviations have the same shape.

Use judgment. A few edge cases do not condemn an architecture; complexity in the data is not necessarily complexity in the design.

When you scrap:

1. Re-run the `how` operator over what was built.
2. Redesign as if the new constraints were day-one assumptions.
3. Subtract before adding; the new sketch should be smaller before it grows.
4. Return to Phase B and re-run the arena.

## Outputs

Write caller usage first and derive the type sketch from it. Use one file with new types and signatures for small changes, or a module map plus type definitions for larger work. Ship the rationale alongside, shaped by `skill://pstack/operators/references/architect/rationale-template.md`, including the usage sketch and synthesis decision.
