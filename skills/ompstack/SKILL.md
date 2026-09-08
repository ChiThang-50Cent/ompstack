---
name: ompstack
description: Risk-routed engineering workflow for OhMyPi coding tasks. Use for non-trivial features, bug fixes, refactors, regressions, or rigorous multi-agent verification. Prefer OhMyPi built-in task, scout, reviewer, and security-reviewer agents; add parallelism only when risk or independence justifies the token cost.
---

# ompstack

Treat this skill as the control plane for engineering work. Reuse OhMyPi primitives instead of recreating them.

## Native primitives

- Use the parent agent for coordination, deterministic gates, and final decisions.
- Use the bundled `task` agent for implementation work. Do not create a separate owner agent.
- Use bundled `scout` only when the relevant files or runtime path are genuinely unknown.
- Use bundled `reviewer` for independent patch review.
- Use bundled `security-reviewer` only when the change has a meaningful security boundary.
- Use `ompstack-architect` only when a design choice is material or contested.
- Use `ompstack-verifier` as a trusted independent behavioral verifier. It may run targeted commands or reproductions and is instructed not to edit, but its tools are not a write sandbox.

## Start by routing risk

Classify the change before spawning agents. Read `skill://ompstack/playbooks/risk-routing.md`.

Select one primary workflow by task intent:

- Read-only question, explanation, or evidence-backed recommendation: read `skill://ompstack/playbooks/investigation.md`.
- Bug or regression: read `skill://ompstack/playbooks/bug-fix.md`.
- New or intentionally changed behavior: read `skill://ompstack/playbooks/feature.md`.
- Structural change with unchanged behavior: read `skill://ompstack/playbooks/refactoring.md`.
- Empirical design, interaction, behavior, or timing decision: read `skill://ompstack/playbooks/prototype.md`.
- Measured slowness or throughput regression: read `skill://ompstack/playbooks/perf-issue.md`.
- Live leak, idle CPU spin, race, or glitch diagnosis: read `skill://ompstack/playbooks/runtime-forensics.md`.
- Captured trace, profile, heap snapshot, or spindump diagnosis: read `skill://ompstack/playbooks/trace-forensics.md`.
- Change to this plugin's skill, agent, command, routing policy, or fixtures: read `skill://ompstack/playbooks/eval.md`.

Then apply execution guidance without replacing the primary workflow:

- Several independent work items: apply the queue overlay in `skill://ompstack/playbooks/queue.md`.
- Verification or merge-readiness: apply the verification phase in `skill://ompstack/playbooks/verification.md`.

## Verification capability

For behavior-affecting work, resolve the proof surface after selecting the primary route:

- Prefer a matching project-native `verify-<surface>` skill under `.omp/skills/`; OMP discovers these ahead of plugin skills.
- Otherwise reuse an existing repository-owned proof surface.
- Create a verification capability only when the user explicitly asks, or when no real proof surface can be named and the user extends scope for that infrastructure. Read `skill://ompstack-create-verification`.
- Maintain an existing project verification skill only on an explicit audit/drift request. Read `skill://ompstack-maintain-verification`.
An unavailable Doctor or runtime surface is `BLOCKED` evidence with its exact prerequisite. `INCONCLUSIVE` belongs only to an optional external evidence adapter that cannot establish its declared predicate. Neither state is a product `FAIL`.


## Default workflow

1. Establish the target, constraints, acceptance criteria, and closest real proof surface.
2. Inspect the current state. Resolve a project verification capability when its trigger applies. Use `scout` only if discovery is genuinely broad or the affected files are unknown.
3. For Medium, High, or Critical write work, record the preflight contract below before opening a write lane.
4. Decide whether architecture work is necessary. Skip it for obvious local changes. For a contested design, submit one or two `ompstack-architect` candidates in a design-only `tasks[]` batch against the same brief. Synthesize their output before starting a separate implementation batch.
5. Implement in the smallest useful number of write lanes. Prefer one-pass workers that investigate and edit in the same task.
6. After fan-in, run Doctor when the selected capability requires it, then deterministic validation once from the parent: the narrowest relevant tests, typecheck/lint/build, and the original reproduction for bugs.
7. Drive the closest real proof surface. Route independent review according to risk only after deterministic evidence is available.
8. Triage findings. Send accepted findings back to the original write lane or fix them in the parent when the parent owns the change.
9. If behavior-affecting code changes after a verdict, invalidate the relevant verdict and rerun only the Doctor, gates, drives, and review lanes that could be affected.
10. For autonomous, multi-phase, high-risk, or handoff work, record material forks and evidence through `skill://ompstack-decision-trail`.
11. Finish with evidence: changed scope, tests/reproduction, real-surface proof, review findings, and anything not verified.

## Preflight contract

For Medium, High, or Critical write work, record this state in the parent and carry it in every implementation batch `context`:

```text
# Goal
Observable behavior and exact proof surface.

# Constraints
Primary route: <playbook>
Execution overlays/phases: <none|queue|verification|queue + verification>
Risk: <low|medium|high|critical>
Compatibility and repository constraints.

# Contract
Write owner: parent or named lane.
Writable files/symbols: known targets, or "discover before edit".
Shared contract: data/API/ordering invariants and their owner.
Independent evidence: none, reviewer, verifier, reviewer + verifier, security-reviewer, or reviewer + verifier + security-reviewer.
```

For parallel work, add each lane's writable and read-only surfaces, one owner for every shared type/schema/API, the parent as integration owner, fan-in order, and the single shared deterministic gate. Do not require exact filenames before discovery establishes them.

## Task contract

Subagents start without conversation history. Every delegated task must be self-contained.

For general implementation, omit `agent` so OhMyPi uses its default `task` worker. Structure the task body with:

```text
# Target
Exact files, subsystem, or behavior to own.

# Change
What to implement and important constraints/contracts.

# Acceptance
Concrete local evidence this worker should leave behind.
```

Do not ask each implementation worker to run whole-project formatters, linters, or broad test suites. Run shared deterministic gates once after fan-in unless a worker needs a narrow command to prove its own change.

When batching work, put the preflight contract in the required shared `context` once. Keep each task focused on its owned change.

Use `outputSchema` with `schemaMode: "strict"` when a subagent must return a machine-checked contract or verdict.

For large logs or payloads, prefer a file or `local://` reference rather than duplicating the payload into every task prompt.

Task jobs may complete asynchronously. Before synthesis or a shared gate, collect every required result through auto-delivery or `hub wait`, then read the relevant `agent://`, `history://`, or artifact payload. A successful `task` call is not itself fan-in.

## Parallelism rules

Parallelize independent investigation, design comparisons, implementation lanes, or verification lanes only when it reduces elapsed work or provides independent evidence.

Do not use multi-agent ceremony as a default quality signal. A three-line isolated change should not trigger scout + architect + writer + reviewer + verifier.

When tasks may touch the same subsystem, define shared contracts first. Use OhMyPi isolation only when the current task schema exposes `isolated` and the work benefits from separate workspaces. Isolation does not replace ownership boundaries.

A blocking architecture task waits inline, but non-blocking items in the same batch may still start. Never mix design and implementation lanes in one batch.

## Human boundary

Do not merge, deploy, publish, or perform irreversible external actions unless the user explicitly requested that action. The workflow may produce a merge-ready verdict without performing the merge.
