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
- Use `ompstack-verifier` for independent behavioral verification by running targeted commands or reproductions without editing.

## Start by routing risk

Classify the change before spawning agents. Read `skill://ompstack/playbooks/risk-routing.md`.

Select one primary workflow:

- Read-only question, explanation, or evidence-backed recommendation: read `skill://ompstack/playbooks/investigation.md`.
- Bug or regression: read `skill://ompstack/playbooks/bug-fix.md`.
- New or intentionally changed behavior: read `skill://ompstack/playbooks/feature.md`.
- Structural change with unchanged behavior: read `skill://ompstack/playbooks/refactoring.md`.
- Empirical design, interaction, behavior, or timing decision: read `skill://ompstack/playbooks/prototype.md`.
- Several independent work items: read `skill://ompstack/playbooks/queue.md`.
- Verification or merge-readiness: read `skill://ompstack/playbooks/verification.md`.

## Default workflow

1. Establish the target, constraints, and acceptance criteria.
2. Inspect the current state. Use `scout` only if discovery is genuinely broad or the affected files are unknown.
3. Decide whether architecture work is necessary. Skip it for obvious local changes. For a contested design, submit one or two `ompstack-architect` candidates in one `tasks[]` batch against the same brief, then synthesize the decision before any write lane starts.
4. Implement in the smallest useful number of write lanes. Prefer one-pass workers that investigate and edit in the same task.
5. After fan-in, run deterministic validation once from the parent: the narrowest relevant tests, typecheck/lint/build, and the original reproduction for bugs.
6. Route independent review according to risk. Do not fan out reviewers before deterministic gates pass.
7. Triage findings. Send accepted findings back to the original write lane or fix them in the parent when the parent owns the change.
8. If behavior-affecting code changes after a verdict, invalidate the relevant verdict and rerun only the gates/review lanes that could be affected.
9. Finish with evidence: changed scope, tests/reproduction, review findings, and anything not verified.

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

When batching work, put common context and cross-task contracts in the batch `context` once. Keep each task focused on its owned change.

For large logs or payloads, prefer a file or `local://` reference rather than duplicating the payload into every task prompt.

## Parallelism rules

Parallelize independent investigation, design comparisons, implementation lanes, or verification lanes only when it reduces elapsed work or provides independent evidence.

Do not use multi-agent ceremony as a default quality signal. A three-line isolated change should not trigger scout + architect + writer + reviewer + verifier.

When tasks may touch the same subsystem, define shared contracts first. Use OhMyPi isolation only when the runtime exposes it and the work really benefits from separate workspaces; never assume isolation is available.

## Human boundary

Do not merge, deploy, publish, or perform irreversible external actions unless the user explicitly requested that action. The workflow may produce a merge-ready verdict without performing the merge.
