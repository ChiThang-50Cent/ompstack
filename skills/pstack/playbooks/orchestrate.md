---
name: pstack-orchestrate
description: Coordinate a multi-day program that outlives one agent, using durable briefs, bounded task waves, a computed frontier, independent verification, and explicit human gates.
---

# Orchestrate

Own the program, never the code. Author briefs, drain the queue, keep the frontier green, and decide. Use this playbook for a whole project handed to one standing coordinator: multiple days, many stacked changes, many workers, and a human checking in periodically rather than every few minutes. One task driven to a predicate is `autonomous-run`. One ambitious run needing a bespoke workflow is `figure-it-out`. Route here when the work outlives any single agent. Work one agent can finish inside the session budget is not a program.

Ceremony scales with the program. Collapse it for cheap near-identical units only when the section below says how.

Three rules carry the rest:

- Completions are queue events, not interrupts.
- Every spawn and every resume carries the standing orders verbatim.
- The brief is the product. A vague brief fails quietly because a worker cannot ask the coordinator a question.

## Limits in OMP

See [OMP limits](../../../docs/limitations.md#multi-day-autonomy). OMP supplies task dispatch, job snapshots, waits, session state, and model-role routing; it does not supply an external distributed queue, leases, daemon recovery, or automatic forge merge authority. This playbook therefore keeps the durable program record explicit, treats provider disappearance as a reconciliation boundary, and never claims host-independent execution.

## Roles and placement

- **Coordinator (the parent session).** Frames the program, authors briefs, drains results, owns the human report, and makes judgment calls. It does not write the program's feature code. Conflicted merges, restacks, and code changes are bounded tasks. Mechanically landing a verified unit may be bookkeeping when local Git is cheap and authority is granted. Queueing finished work behind an idle integrator wastes the budget. State reads and writes happen at drain points through the durable program files and `pstack_decision`; the coordinator must not infer state from prose alone.
- **Track coordinator.** Use only when one parent cannot drain the track. Keep it as a named, bounded OMP task with an exclusive track directory and an explicit rollup contract. It authors worker briefs and reports aggregates; it does not forward raw child transcripts. Avoid nested coordinator layers: each one repays orientation cost and can hide children while its parent waits. Keep at most roughly ten children in flight for one drain window, and refill as results become terminal rather than creating a blocking wave.
- **Worker and verifier.** Use `pstack-builder` or a bounded writer task for code, and `pstack-verifier` or a read-only reviewer for proof. Give each writer one branch or worktree. Run verification from a different model family when the unit is judgment-laden or high blast radius. Use `task.isolation.enabled` only when the host has proved it; never claim isolation because a prompt requested it.

Depth stays at coordinator, track, worker. Build, landing, and verification are common cuts, not a required tree. Design tracks for the project rather than hard-coding a universal swarm.

## Durable program record

Create `orchestrate/<project-slug>/` in the repository or OMP-backed store selected by the parent goal, and record that root in the first decision. Every file has exactly one writer. Owners publish facts; readers aggregate at drain time. There is no bundled OMP `orch` command, so plain JSON/TSV/Markdown remain the canonical readable record and `pstack_decision` is the decision trail.

- `preferences.md` is the standing-orders register: numbered lines, one constraint each for model policy, stack shape and count, verification bar, forbidden paths, and escalation policy. Paste it verbatim into every spawn and resume. When a correction is repeated, append the rule before acting.
- `overview.md` is the durable PR and issue database. Append events; do not rewrite it wholesale.
- `units.tsv` has one row per unit: id, track, state, branch, PR, head SHA, brief path, and last evidence.
- `frontier.json` is the computed merge frontier, not a narrative summary.
- `ledger.tsv` is the verification ledger, keyed by PR and current head SHA.
- `inbox/` holds completion pointers or compact task-result artifacts.
- `gates.md` parks human gates with the question, options, and safe default if no answer arrives.
- `decisions.tsv` is an optional export of the `pstack_decision` trail.
- `status.md` is derived from `units.tsv` and `ledger.tsv` at each drain. Never hand-maintain it as event narration.

If the host cannot persist the chosen root, stop the program at a durable handoff instead of keeping state only in the chat transcript.

## The brief

A worker prompt is the only product the worker reliably receives. Every spawn carries the complete brief and the standing orders. A field you cannot fill is a unit you have not scoped.

```text
GOAL         one sentence, executable by a stranger with no chat access
SCOPE        paths this unit may write; paths it may not; exclusive branch/worktree
CONTEXT      files, PRs, upstream reports, and current frontier facts
ACCEPTANCE   one checkable criterion per line
VERIFY       exact commands or the project verification skill, with gotchas
TIMEBOX      rough cap; on expiry return partial findings and stop
FORBIDDEN    no force-push, no unrelated fixes, no scope expansion, unit-specific bans
REPORT       status, branch, head SHA, verdict, commands actually run, deviations, follow-ups
STANDING     preferences.md pasted verbatim
```

Size the brief to the unit. A one-command unit needs the goal, scope, verify command, and report shape, not a giant scaffold. A sub-coordinator brief also names its track boundary, unit list, spawn budget, drain protocol, and rollup format: child name, state, PR, head SHA, verdict, one-line result, track status, and frontier delta.

A dependency is a context relay, not merely ordering. Undeclared upstream context makes a worker guess. Missing fields are a refuse-to-spawn condition. Audit one sampled brief per track and wave alongside the wave; a failing brief stops the next refill and fixes the coordinator contract, not just the worker. Never resume-chain a sloppy brief. Respawn with consolidated scope.

## Steps

1. **Frame.** State a countable done predicate, such as every unit merged and ledger-verified at the required level. Quantify units, rough effort, expected stacks, tracks, and wall-clock budget. If one agent can finish inside that budget, use `autonomous-run` instead. Collapsing means doing the work directly in this session with inline verification and no program machinery. Schedule landing against the budget; around 70%, stop spawning and land verified work. A contested decomposition or one-way door goes through `arena` before the pilot. Reversible preparation does not wait for a human.
2. **Install the record.** Create the durable root, open the `pstack-show-me-your-work` trail, write standing orders before any spawn, and seed `frontier.json` from existing PRs and branch heads. Record the exact repository and base revision.
3. **Pilot.** Push one unit through the whole path: brief, writer, verification, ledger row, frontier update, and landing or explicit hold. The pilot falsifies the brief template, verify recipe, and unit size while the cost is one worker. Fix the contract from pilot evidence before fan-out. For cheap clone-units, the first normal unit is the pilot; a dedicated verifier lane is for novel, expensive, or high-risk shapes.
4. **Scale.** Dispatch a rolling task window up to the in-flight cap, refilling as children become terminal. Blocking batches pay the slowest child. Recompute ready work after each drain. Relay upstream reports into downstream briefs. Keep sibling communication upward. A sampled brief audit runs beside the wave it samples and blocks only the next refill when it fails.
5. **Drain.** Apply the queue discipline below at every drain point.
6. **Land.** Integration starts with the first verified unit and runs beside remaining waves. Keep the frontier green before upper-stack work. One topology writer owns branch bases, restacks, and PR retargets; writers never mutate shared topology. Advance `frontier.json` only on merge or a reported new head SHA.
7. **Close.** Drain the final inbox. Reconcile every spawned task to a terminal row: done, abandoned, or zombie-reconciled. Confirm the predicate on the real artifact, every landed PR's current head SHA has a verdict, the decision trail has its cross-model review, and recurring corrections are encoded in preferences or the brief template. Leave the record intact as the postmortem.

## Queue and drain

- A task result becomes an inbox pointer. Record it and return to the current critical section; do not deep-review a diff inside the drain. A result needing review becomes a verifier unit.
- Drain at the end of a critical section, a track rollup, a scheduled OMP goal wake, and before a human report. Start each drain by reading the inbox snapshot. Results arriving during a drain wait for the next drain.
- Critical sections include authoring a brief, a topology operation, a conflict decision, writing a gate, and updating the ledger or frontier.
- Classify each pointer as landed, needs verification, failed, zombie, or noise. Update unit rows, ledger rows, and status, then dispatch the next wave in one parent turn. Reconcile every spawned child at its track rollup: arrived, respawned, or explicitly absorbed.
- A drain ends with counts by state, what changed, and open gates. Detail lives in the durable files. The full reply contract applies at checkpoints and close.

## Stack safety

The frontier is computed, never narrative. Recompute it after every merge and stack mutation from the forge's ordered PR list, branch names, head SHAs, base revision, generation, and lowest unmerged PR. If local metadata cannot resolve the stack, report that fact instead of guessing.

Exactly one topology writer operates on a stack. Workers do not rebase or retarget. The topology writer uses current base refs, checks the lease before a force-with-lease push, and records every rewritten SHA. A babysitter observes one immutable frontier generation and reports conflicts; it does not restack. Closing or retargeting a base PR can orphan the chain and therefore requires a separate brief and gate. Keep one retro watcher for reverts, post-merge CI failures, and orphaned follow-ups.

## Verification

Scale verification to the unit. If `VERIFY` is one cheap command, the worker runs it and reports the exact output; the coordinator spot-checks receipts. A dedicated verifier uses another model family when verification is expensive, judgment-laden, or high blast radius. Re-running one command without artifact inspection is ceremony, not proof.

Ledger rows use a stable verdict vocabulary: `live-ui-verified`, `unit-test-verified`, `type-check-only`, `verifier-blocked`, or `verifier-failed`. CI green is input, not a verdict. Behavioral work needs better than type-check-only. A blocked verifier is not a pass; retry when the environment heals. A failed verifier gets a fix unit, not a blind re-run. A writer may self-report, but an independent verifier overrides it for the same PR/head key. A new head voids the old row and requires re-verification after restack.

A unit is not done until its output is externalized when it lands. Push the branch, retain the verifier record, and write receipts to the durable store. Work that exists only on one machine or in one transcript was not done.

## Liveness and failure

Do not resume an agent merely to check it; a resume can restart idle work. Probe the ledger, unit rows, forge branch/PR state, OMP job snapshots, and session evidence. Session mtime is not proof of liveness.

A silent death gets a postmortem row with unit, failure mode, last evidence, and options. Replan as evidence arrives; do not wait for full quiescence. Retry by mode: resource cap or memory pressure means smaller scope; network failure means retry as-is; tool error means a different model role; unknown means one retry. After two retries, abandon and replan. A late zombie is reconciled against the current frontier and ledger before acceptance; salvage unique findings through a fresh task, never a blind merge.

When more spawning would produce tree-wide garbage because an upstream result, acceptance contract, or infrastructure path is broken, write a stop line at the top of standing orders, let in-flight work finish, fix the cause, and clear the line. Bound infrastructure retries too. After repeated tool aborts, write a terminal handoff with completed work, durable location, and exact resume command, then end the run.

If the OMP host or provider restarts, assume local tasks are dead until their job state is reconciled. Re-read preferences and units, recompute the frontier, reattach surviving work by PR and branch rather than task ID, recreate one bounded track task per track from its stored brief and current state, then drain. Do not infer survival from a notification.

## Program invariant

Every unit has one owner, one scoped branch or worktree, one current head, one acceptance row, and one verification outcome. Every result is either externalized into the record or explicitly discarded with a reason. A track cannot report green while a child is missing, a current-head verdict is absent, or the frontier is stale. When the record and a notification disagree, trust the artifact and job snapshot, record the discrepancy, and reconcile it before refill.

Keep the queue bounded by the coordinator's ability to drain it. More workers do not increase throughput when their reports cannot be classified, their branches overlap, or their verification receipts arrive after the base has moved. Reduce the window, repair the brief, and resume from the last durable frontier rather than spawning around uncertainty.

## Escalation

Batch human gates into the status page: force-pushes to shared branches, deploys, deletions, closing another person's PR, genuine product or preference calls no experiment settles, standing orders contradicted by reality, and a program dead end that survived a replan. Park each in `gates.md` and route other work around it.

Do not ask about frontier nudges, retry mechanics, CI flake triage, review-thread triage, formatting, or scope the brief already forbids. Act and log. Mid-run discoveries fix only what blocks the frontier; everything else becomes a follow-up.

## Reply

At checkpoints and close return the predicate and counts from `units.tsv` and `ledger.tsv`, tracks and landed units, frontier PRs and SHAs, verdict summary, abandoned work and reason, only the gates awaiting the human, durable store path, and decision-trail path. Numbers come from tables, not narrative. Include forge links where available.
