---
name: pstack
description: Evidence-first engineering operating system for OMP. Use for nontrivial investigation, bug fixes, features, refactors, migrations, performance, review, arenas, shipping, and multi-phase autonomous work that needs bounded agents and independent verification.
---
# Pstack for Oh My Pi

Pstack is the control policy; OMP is the execution substrate. The coordinator owns interpretation, decomposition, integration, and correctness. Workers own bounded artifacts. A worker summary is a claim until the artifact and real behavior are independently checked.

## Start here

1. Read `pstack_status`.
2. If no run exists and the work is not direct, open proof state with `pstack_gate action=init` and explicit acceptance criteria. With an active OMP goal the objective defaults to the goal; the goal text is context, not a criterion.
3. Load exactly one matching playbook from `skill://pstack/playbooks/<name>.md`.
4. Plan with OMP (plan mode, TODO, goal). Copy the playbook phases into the TODO; record a skipped step as a `pstack_decision` with a concrete reason.
5. Load only the operators and principles needed for the current phase; do not flood the context with the whole corpus.
6. Keep the proof state current: acceptance, evidence, decisions, fingerprint, and verdict. Agents and provenance are recorded automatically.
7. Finish with `goal op=complete` (refused until gates pass) or, without goal mode, `pstack_gate action=check` / `/pstack check`; never merely state that the task is done.

## Ceremony selection

- **direct**: local, reversible, obvious change with one owner and a proportionate check. Do not create a panel.
- **standard**: bounded bug or feature. Ground, implement in isolation where useful, inspect the diff, verify behavior.
- **strict**: cross-boundary, security/data risk, contested design, uncertain root cause, or expensive regression. Separate architect/builder/reviewer/verifier contexts.
- **program**: multiple workstreams, phases, PRs, or a long autonomous session. Use durable briefs, checkpoints, and a queue/ledger. OMP session persistence is not a replacement for an external always-on worker daemon.

Escalate ceremony when new evidence increases blast radius. De-escalate when grounding proves the task local. Record the decision.

## Router

| Signal | Playbook |
|---|---|
| Explain current behavior, trace ownership, answer from evidence | `investigation` |
| Reproduce and repair an observed defect | `bug-fix` |
| Add user-visible or API capability | `feature` |
| Observable fork in behavior, UX, timing, library behavior | `empirical-prototype` |
| Latency, throughput, allocation, resource use | `performance` |
| Structural change intended to preserve behavior | `refactor` |
| Schema/API/data/caller transition | `migration` |
| Active production or operational failure | `incident` |
| Assess an existing patch or artifact | `review` |
| Competing implementations or designs | `arena` |
| Long or staged work in one live OMP session | `multi-phase` |
| PR stack, landing, or release gate | `shipping` |
| Threat model or security-sensitive change | `security` |
| Broken/flaky/insufficient tests | `test-repair` |
| Package/runtime/toolchain update | `dependency-upgrade` |
| Documentation as the primary artifact | `documentation` |

## Non-negotiable execution contract

### Ground before change

Establish current behavior, owners, boundaries, consumers, relevant history, and blast radius. Separate facts, inferences, and unknowns. For nontrivial changes, dispatch `pstack-scout`; for rationale/history, load `skill://pstack/operators/why.md`.

### Name the data shape

Before code crosses a function or module boundary, state the core types, states, ownership, invariants, and failure policy. Use `pstack-architect` when design spans boundaries or is contested.

### Resolve empirical uncertainty empirically

Behavior, layout, timing, output, compatibility, and performance are observable questions. Prototype, run, or measure them. Ask the user only for genuine product preference, inaccessible credentials/data, or irreversible/high-consequence authorization.

### Bound delegation

Every task must specify:
- frozen objective and constraints;
- exact artifact or ownership boundary;
- inputs and allowed tools;
- output schema;
- done predicate;
- prohibited actions;
- evidence expected.

Use file/artifact pointers instead of pasting large contents into the parent context. Parallel writers must not share a worktree or mutable artifact.

### Separate writer and verifier

Builders do not grant PASS. The final verifier must be a separate actor/context, preferably a different model family when configured. It receives the artifact, acceptance criteria, original reproduction, writer identities, and target fingerprint—not the writer's self-justification.

### Verify the real surface

Use the project's verification skill when available, such as `skill://verify-my-project`. Exercise the surface relied upon by users or callers. Build/lint/unit tests can support the verdict but cannot substitute for the relevant runtime behavior.

### Bind verdicts to artifacts

A final verdict records the exact fingerprint. Any later file change makes that verdict stale. Re-run verification after synthesis, conflict resolution, formatting that can change semantics, generated output, or any patch.

### Persist state outside conversation memory

Use pstack tools and `.omp/pstack/runs/<run-id>/` audit artifacts. Record decisions as `decision / why / evidence / result`, not private scratchpad narrative. Update acceptance as evidence arrives.

### Respect reversibility

Proceed autonomously with local, reversible investigation, edits, tests, prototypes, and branches. Pause before deployment, force-pushing shared branches, destructive data changes, customer/public messages, secret handling outside existing boundaries, or actions explicitly gated by the operator.

## Agent topology

- `pstack-scout`: read-only current-system and history evidence.
- `pstack-architect`: read-only design, data shapes, boundaries, alternatives.
- `pstack-builder`: one isolated bounded implementation.
- `pstack-reviewer`: read-only adversarial defect review of actual artifact.
- `pstack-judge`: blinded same-rubric arena evaluation.
- `pstack-synthesizer`: one isolated integration of selected base and grafts.
- `pstack-verifier`: read-only real-surface verifier that returns a strict artifact-bound report; the parent runtime validates and records the verdict.

The coordinator remains accountable for reviewing diffs, reconciling conflicts, and deciding what proceeds. Delegation never transfers correctness ownership.

## Core operators

Load on demand:
- `skill://pstack/operators/how.md`
- `skill://pstack/operators/why.md`
- `skill://pstack/operators/architect.md`
- `skill://pstack/operators/swarm.md`
- `skill://pstack/operators/arena.md`
- `skill://pstack/operators/interrogate.md`
- `skill://pstack/operators/verification.md`
- `skill://pstack/operators/decision-trail.md`
- `skill://pstack/operators/context-budget.md`
- `skill://pstack/operators/session-pickup.md`
- `skill://pstack/operators/empirical-decision.md`
- `skill://pstack/operators/closeout.md`

## Completion

A run can complete only when all required acceptance criteria are passed or explicitly waived with reasons, no required worker is pending, the independent verdict is PASS when verification is required, evidence references exist, writer and verifier are distinct, and the verdict fingerprint equals the current artifact fingerprint. FAIL and INCONCLUSIVE are not success states.
