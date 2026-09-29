# Specification discovery

Use this playbook in `SPEC_DISCOVERY` before committing to product semantics.

## Goal

Turn a rough intent into an evidence-backed provisional product model. The model must distinguish facts, derived behavior, assumptions, and unresolved decisions; it is not yet an implementation plan.

## Procedure

1. Identify the user-facing entry point, actors and permissions, affected entities, persistence, public API/CLI/UI surface, side effects, and analogous flows.
2. Search domain types/models, constraints, handlers, authorization checks, tests, configuration, jobs/events, audit conventions, docs, and history around the surface.
3. State the root cause, not only the observed symptom. Anchor the statement in at least one concrete evidence pointer and trace the same cause through every relevant layer.
4. Enumerate sibling sites that share the root cause. For each site, decide `fix` or `unrelated`; attach acceptance criteria to fixes and a non-empty rationale to unrelated sites.
5. Ask: “what else shares this root cause?”, “what is the inverse operation (parse↔serialize, read↔write, create↔delete)?”, and “does a round trip preserve meaning?” Inspect both directions and all consumers before narrowing scope.
6. Run existing behavior or a small throwaway experiment when that is cheaper and safer than guessing. Keep experiments out of the shipped patch.
7. Build a behavior matrix with at least `happy_path`, `invalid_input`, `inverse_direction`, `round_trip`, and `backward_compat` rows, plus relevant retries/idempotency, duplicates, concurrency, expiry/revocation, partial failure, restart, and observability dimensions. Mark inapplicable rows `n/a` with a rationale.
8. For each material behavior, record a source, confidence, and reversibility. Facts from code/tests/docs are not user decisions; assumptions must remain visible.
9. Identify only consequential gaps that remain after repository and experiment-based discovery.

## Deliverable

Provide the root with a non-empty root-cause statement and evidence pointers, complete sibling-site decisions, the required behavior-matrix rows, relevant files and line references, invariants, analogous flows, tests, ambiguity findings, and unknowns. The root then uses `mr_contract` to create a versioned contract; do not silently turn a plausible convention into an explicit user requirement. A contract is not ready until scope-completeness fields explain the cause, sibling coverage, inverse direction, round-trip meaning, and backward compatibility.
