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
| Evaluation design, blinded variants, one frozen rubric | `eval` |
| One metric, repeated hypothesis/measurement loop | `hillclimb` |
| Captured trace/profile artifact diagnosis | `trace-forensics` |
| Live-process instrumentation and runtime diagnosis | `runtime-forensics` |
| Author or modify an OMP skill | `authoring-a-skill` |
| Create a reviewable pull request or ordered PR stack | `opening-a-pr` |

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

- `pstack-scout`: inspect-only current-system and history evidence.
- `pstack-architect`: inspect-only design, data shapes, boundaries, alternatives.
- `pstack-builder`: one bounded implementation; task isolation is owned by OMP.
- `pstack-reviewer`: shell-capable adversarial defect review of the actual artifact; no `edit`/`write` tools.
- `pstack-reviewer-a`, `pstack-reviewer-b`, and `pstack-reviewer-c`: independent panel reviewers using the reviewer contract.
- `pstack-comment-sicko`: read-only comment review using the reviewer schema; it never edits application files.
- `pstack-judge`: inspect-only blinded same-rubric arena evaluation.
- `pstack-synthesizer`: one bounded integration; task isolation is owned by OMP.
- `pstack-verifier`: shell-capable real-surface verifier with no `edit`/`write` tools; the parent runtime validates and records the report.

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

## Poteto-mode compatibility

The upstream poteto rules are adapted here to OMP's durable policy and agent contracts. Apply these rules without changing the extension's compact `src/policy.ts` output. This skill is loaded on demand.

### Principles and triggers

When a principle shapes a decision, name the principle and the concrete choice it changed. Cite only a leaf principle read in the current session.

- Nontrivial behavior, architecture, or an "are we sure?" question uses `skill://pstack/operators/how.md`.
- Code crossing a function or module boundary names the data shape first and uses `skill://pstack/operators/architect.md`.
- Parallel evidence partitions use `skill://pstack/operators/swarm.md`. Competing artifacts or designs use `skill://pstack/operators/arena.md`.
- Contested or high-risk changes use `skill://pstack/operators/interrogate.md` before shipping.
- A nontrivial multi-step feature records the throughput checkpoint from `skill://pstack/playbooks/feature.md`.
- Any prose surface, including this reply and agent-facing instructions, uses `skill://pstack-unslop`. Preserve meaning and match the intended tone.
- Long, autonomous, or multi-phase work uses `skill://pstack/operators/decision-trail.md` and `skill://pstack/playbooks/multi-phase.md` when the work spans dependent phases.
- A broken local skill is repaired in its own bounded change. Do not silently work around it.

### Classify before asking

Before asking the human to choose between approaches, classify the fork. If the answer is an observable fact about behavior, timing, layout, output, compatibility, performance, or evaluation separation, run the smallest discriminating experiment through `skill://pstack/playbooks/empirical-prototype.md`. Do not ask the human to answer a fact the repository or runtime can measure. Ask only for product direction, user preference, intent, authority, inaccessible data, or an irreversible/high-consequence decision. A read-only investigation with a cited answer stays an investigation instead of building a prototype.

When the user grants full autonomy, decide reversible choices covered by that grant, act, and report the decision. Always pause before force-pushing a shared branch, deploying, deleting production data, sending customer or public messages, changing secrets outside existing boundaries, or taking another irreversible action.

### Delegation defaults

Use OMP agents only for bounded work. Pass file or artifact pointers instead of copying large content into the parent context. Freeze objective, ownership, inputs, allowed tools, output schema, done predicate, prohibited actions, and evidence. The hardest cross-cutting design, concurrency, or subtle algorithm work goes to `@pstack_reason`; simpler implementation work uses the role chain selected by OMP. Parallel writers require separate worktrees or artifacts, and the coordinator reviews every result and owns correctness.

### Reply and comment style

Write short declarative sentences. Avoid em dashes and mid-sentence colons. Keep the detail, tradeoffs, choices, and open decisions required by the selected playbook. State the consumer and maintainer impact before implementation detail. Put evidence or an explicit inference label in the same sentence as every claim. Link only artifacts read or produced in the current session. Comments explain non-obvious why; tests and logs should carry phase meaning instead of narration.

### Sticky mode semantics

`off`, `auto`, and `strict` are sticky OMP session modes. `off` disables policy injection, task rewriting, provenance tracking, and completion blocking while leaving normal OMP tools present. `auto` routes ordinary work proportionally. `strict` requires an active pstack run before pstack agents spawn and enforces the completion gates. Set the mode through `/pstack auto`, `/pstack strict`, or `/pstack off`; loading this skill never changes it.

### Playbook sequencing

Open a TODO whose first items are the matched playbook's phases before adding task-specific items. Copy the phase procedure into the TODO. A skipped phase remains visible with a concrete reason. Use the existing OMP playbook that matches the work; use `pstack-multi-phase` when the effort crosses dependent phases or requires a durable frontier. Verify each unit before advancing and close through the gate rather than merely stating that the work is done.

## Completion

A run can complete only when all required acceptance criteria are passed or explicitly waived with reasons, no required worker is pending, the independent verdict is PASS when verification is required, evidence references exist, writer and verifier are distinct, and the verdict fingerprint equals the current artifact fingerprint. FAIL and INCONCLUSIVE are not success states.
