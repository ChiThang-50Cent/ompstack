# Refactoring workflow

Use this for a structural change whose observable behavior must remain unchanged: rename, extract, inline, deduplicate, move, or reshape an existing module. A discovered defect or intended behavior change reroutes to Bug fix or Feature.

## 1. Pin the existing contract

Before moving structure, identify the observable behavior that must hold. Reuse an existing targeted test, snapshot, equivalence harness, CLI/API example, or matching runtime baseline. Typecheck and lint alone are not a behavior pin.

If no adequate proof exists, create the smallest deterministic characterization before the refactor. Record the relevant inputs, outputs, side effects, and error behavior.

## 2. Name the target shape

State the structural problem and the simpler resulting shape. Prefer a change that removes indirection, duplicated branching, dead paths, or invalid state rather than adding a new abstraction.

Use `ompstack-architect` only when the target crosses material subsystem, persistence, concurrency, or compatibility boundaries.

## 3. Move in verifiable units

Keep one write owner for each shared surface. Make the smallest behavior-preserving steps, retaining the pin after each meaningful step.

When replacing an API, migrate every caller and delete the old path in the same coherent change. Do not leave aliases, compatibility shims, or parallel implementations unless the requested contract requires them.

## 4. Prove equivalence

Run the behavior pin and the closest matching real surface after the reshape. Then run the narrow deterministic checks that guard the changed boundary. A compile-only result is insufficient.

If behavior differs, stop calling the work a refactor. Restore the pin or reroute the behavior change explicitly.

## Reply

Report the old and target shapes, the behavior pin, the equivalence evidence, and the reader-load or complexity removed. State explicitly when no user-visible behavior changed.