---
name: ompstack
description: Explicitly invoked Ompstack risk-routed engineering workflow. Use only when the user invokes /ompstack or /skill:ompstack, or another skill explicitly requires it.
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

## Native Todo progress tracking

Native `todo` is an optional, parent-owned execution-state layer. It never selects the primary route, replaces the queue overlay, mirrors worker liveness, or acts as durable audit evidence.

Select `Progress tracking: native todo` only when the parent has at least three discrete unfinished actions, multiple material phases, a queue/fan-in boundary, an expected external/runtime blocker, an explicit progress request, or autonomous/handoff work. Otherwise select `Progress tracking: none`; do not create ceremony for a narrow local edit or short read-only answer.

Only after selecting `Progress tracking: native todo`, the parent checks that native Todo is present and enabled, then calls `todo.view` before any mutation. If Todo is unavailable, disabled, or the current session already has a non-empty list that is not unambiguously this workflow's active parent list, preserve it and use `Progress tracking: none`. Never call `todo.init` over a non-empty list. If `todo.view` is empty, initialize the full phased list in that parent turn before starting work; do not merely describe or defer Todo calls. `todo.init` requires the full `list` of named phases, never `phase`/`task` shorthand. Append only newly discovered material work to the current parent list; never reinitialize it to rephrase phases.

The required initial transition is `Progress tracking: none` → no Todo call, or `Progress tracking: native todo` → `todo.view` → `todo.init({ list })` only when the viewed list is empty. The reverse order is invalid. During active coordination, execute these native transitions rather than reporting hypothetical calls.

Only the parent calls `todo.init`, `todo.append`, `todo.done`, `todo.block`, or `todo.unblock`. Task children return outputs and evidence; the parent fans them in, inspects them, then advances Todo. In a no-session run, Todo is only live working state and cannot support a durable handoff.

When Todo is active, use stable unique 5–10 word task names, non-empty route-selected phases, and exact blocker reasons. Keep shared verification pending through fan-in; `todo.block` records an unavailable evidence prerequisite, not a product failure. A behavior-changing patch after a verdict appends a distinct rerun item and reruns affected proof.

Todo state is deliberately separate from Hub/task lifecycle, feature maps, session artifacts, and the proportional decision trail.

## Route intent, then finalize risk

Select the primary workflow from task intent before spawning agents. Read `skill://ompstack/playbooks/risk-routing.md`.

For every non-Low write task, inspect the mutation target directly before selecting final risk, write ownership, or independent evidence. Record the target, semantic boundary, consumer families, execution modes, invariants, graph/reference behavior, and material unknowns. A final Medium route requires source evidence that this surface is bounded and local; unresolved material uncertainty escalates to High. Use `scout` only when direct mapping is genuinely broad or the target remains unknown.

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

When no matching project capability exists, select the closest driver and name its observation and evidence using `skill://ompstack/playbooks/verification.md`'s proof-surface matrix. Do not substitute a static check for an available real surface; an unavailable required surface is `BLOCKED`.

## Opt-in OMP capabilities

These are operator/session facilities, never prerequisites for an Ompstack route or proof:

- **Prewalk:** Ompstack never enables Prewalk, selects its target model, or sets agent prewalk configuration. If an operator already armed it, preserve that setting and name the consequence: a successful Todo call can open its gate and the first workspace `edit` or `write` performs its one-shot handoff. A route must remain correct with no Todo and no Prewalk.
- **Advisor and `WATCHDOG.md`:** Ompstack never enables Advisor, creates watchdog files, or grants an advisor mutating tools. An operator may opt into the default inspection-only advisor for a long-running High/Critical route. Its notes are concerns, not a completion gate or behavioral evidence; keep the normal reviewer/verifier path.
- **Session handoff:** Persisted session artifacts, `history://`, and `agent://` are primary evidence. On an explicit handoff request, `/handoff` creates a compact continuation record and `/export` produces a reviewable HTML artifact. Treat exports as potentially sensitive; never share or upload them without authorization. Do not add a session store or duplicate transcript.
- **Memory:** Memory is optional heuristic context, not current-repository truth. Ompstack never enables a memory backend or captures a lesson automatically. When memory affects a decision, cite its `memory://` path and revalidate it against user instruction and current repository evidence; capture only user-approved, sanitized, durable lessons.


## Default workflow

1. Establish the target, constraints, acceptance criteria, and closest real proof surface.
2. Inspect the current state. Resolve a project verification capability when its trigger applies. Use `scout` only if discovery is genuinely broad or the affected files are unknown.
3. For every non-Low write task, complete the direct risk scan and select final risk from its source evidence.
4. For Medium, High, or Critical write work, record the preflight contract below before opening a write lane.
5. Decide whether architecture work is necessary. Skip it for obvious local changes. For a contested design, submit one or two `ompstack-architect` candidates in a design-only `tasks[]` batch against the same brief. Synthesize their output before starting a separate implementation batch.
6. Implement in the smallest useful number of write lanes. Prefer one-pass workers that investigate and edit in the same task.
7. After fan-in, run Doctor when the selected capability requires it, then deterministic validation once from the parent: the narrowest relevant tests, typecheck/lint/build, and the original reproduction for bugs.
8. Drive the closest real proof surface. Route independent review according to risk only after deterministic evidence is available.
9. Reclassify when discovery, implementation, or a finding changes the risk scan. A Medium-to-High reclassification requires both reviewer and verifier before closeout.
10. Triage findings. Send accepted findings back to the original write lane or fix them in the parent when the parent owns the change.
11. If behavior-affecting code changes after a verdict, invalidate the relevant verdict and rerun only the Doctor, gates, drives, and review lanes that could be affected.
12. For autonomous, multi-phase, high-risk, or handoff work, record material forks and evidence through `skill://ompstack-decision-trail`.
13. Finish with evidence: changed scope, tests/reproduction, real-surface proof, review findings, and anything not verified.

## Preflight contract

For Medium, High, or Critical write work, record this state in the parent and carry it in every implementation batch `context`:

```text
# Goal
Observable behavior and exact proof surface.

# Constraints
Primary route: <playbook>
Execution overlays/phases: <none|queue|verification|queue + verification>
Risk: <low|medium|high|critical>
Risk basis:
- Mutation target: <file:symbol or equivalent source evidence>
- Semantic boundary: <local|shared|public|security>
- Consumers and modes: <bounded list>
- Invariants and graph/reference behavior: <none or stated behavior>
- Material unknowns: <none or stated uncertainty>
Progress tracking: <none|native todo>
Compatibility and repository constraints.

# Contract
Write owner: parent or named lane.
Writable files/symbols: known targets, or "discover before edit".
Shared contract: data/API/ordering invariants and their owner.
Independent evidence: none, reviewer, verifier, reviewer + verifier, security-reviewer, or reviewer + verifier + security-reviewer.
```

For parallel work, add each lane's writable and read-only surfaces, one owner for every shared type/schema/API, the parent as integration owner, a **fan-in record** naming every required lane id, its acceptance predicate, and its output/evidence URI, the fan-in order, and the single shared deterministic gate. Do not require exact filenames before discovery establishes them.

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

A task/job `completed` means the agent yielded or exited successfully, not that its claimed artifact is acceptable. A lane joins fan-in only after the parent inspects its declared output or evidence against the recorded predicate. A failed, aborted, missing, or truncated result is unresolved: inspect `history://<id>` or the full artifact, then repair, replace, or block the parent workflow. Never enter parent synthesis or the shared gate from a partial fan-in.

## Parallelism rules

Parallelize independent investigation, design comparisons, implementation lanes, or verification lanes only when it reduces elapsed work or provides independent evidence.

Do not use multi-agent ceremony as a default quality signal. A three-line isolated change should not trigger scout + architect + writer + reviewer + verifier.

When tasks may touch the same subsystem, define shared contracts first. Use OhMyPi isolation only when the current task schema exposes `isolated` and the work benefits from separate workspaces. Isolation does not replace ownership boundaries.

A blocking architecture task waits inline, but non-blocking items in the same batch may still start. Never mix design and implementation lanes in one batch.

## Human boundary

Do not merge, deploy, publish, or perform irreversible external actions unless the user explicitly requested that action. The workflow may produce a merge-ready verdict without performing the merge.

A headless task child is not a user-authorization boundary. The parent must obtain the user's authorization before any consequential external action; a child's approval mode cannot create that consent.
