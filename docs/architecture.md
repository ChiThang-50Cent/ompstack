# Architecture

## 1. Design goal

`pstack-omp` treats coding-agent execution as a control-system problem rather than a prompt-quality problem. Models are capable but fallible workers. Reliability comes from bounded ownership, durable state, artifact identity, independent checking, and explicit completion gates.

The implementation separates four concerns:

1. **Policy** — which workflow and engineering principles apply.
2. **Execution** — which OMP agent performs a bounded operation, with which tools and model role.
3. **Evidence** — what was observed, on which artifact, through which product surface.
4. **Authority** — who may write, review, verify, mutate run state, or declare completion.

## 2. Process and session topology

OMP re-binds extensions inside custom-agent child sessions. A child therefore has a different extension instance and session manager from the parent coordinator. `pstack-omp` treats that separation as a hard trust boundary:

```text
parent OMP session
  ├─ owns PstackStore and the authoritative run state
  ├─ rewrites task contracts and records actor provenance
  ├─ receives schema-validated task results
  ├─ ingests evidence, acceptance outcomes, and verdicts
  └─ evaluates completion gates

child agent session
  ├─ receives a bounded task and strict output schema
  ├─ is subject to a runtime child-tool guard in addition to its declared allowlist
  ├─ cannot mutate the parent pstack state
  └─ returns structured output to the parent task result
```

Child sessions are detected from OMP's persisted `session_init` contract and, as a fallback, its `<parent-session>/<agent>.jsonl` artifact layout. Parent-only hooks return without injecting policy or writing state when running inside a child.

This is why the custom agents intentionally expose **no `pstack_*` tools**. Because OMP can add baseline/extension tools outside an agent's declared list, the child `tool_call` hook also blocks parent-state tools, nested `task`/`hub` orchestration, direct file mutation for non-writing roles, and shell access for roles that did not request Bash. The verifier produces a verdict report; the parent runtime validates and records it. This guard is still not an operating-system sandbox.

## 3. Major components

### Skill corpus

`skills/pstack/SKILL.md` is the public router skill. Playbooks, operators, principles, and schemas are subordinate assets loaded on demand through `skill://pstack/...` references. This keeps the main context bounded and prevents twenty-three principles from becoming an always-on prompt wall.

### Custom agents

The `agents/` directory defines capability-separated workers. OMP applies their tool allowlists, model patterns, thinking level, blocking behavior, and strict output schemas.

### Extension runtime

`src/index.ts` registers parent-session tools, commands, flags, and lifecycle hooks. Supporting modules isolate responsibilities:

| Module | Responsibility |
|---|---|
| `router.ts` | task/playbook/ceremony classification |
| `state.ts` | pure state transitions |
| `store.ts` | parent session hydration, custom-entry persistence, audit writes |
| `session-kind.ts` | tri-state main / subagent / unknown session detection from `session_init` |
| `child-policy.ts` | child-session guard for parent-owned `pstack_*` state and `hub`; OMP owns all other tool admission |
| `task-rewrite.ts` | frozen task contracts (never rewrites `isolated`) |
| `task-lifecycle.ts` | concurrent/background task provenance and terminal-state reconciliation |
| `result-ingestion.ts` | child structured-output correlation, evidence ingestion, acceptance updates, and verdict ingestion |
| `model-routing.ts` | verifier cross-family reordering of OMP-resolved patterns |
| `fingerprint.ts` | Git/non-Git artifact identity |
| `gates.ts` | deterministic completion predicate |
| `tools.ts` | parent/coordinator run-control and recovery surface |
| `commands.ts` | operator-facing `/pstack` commands |
| `policy.ts` | bounded system-prompt segment |
| `audit.ts` | human-readable state/event snapshots |
| `validation.ts` | verdict provenance and semantic validation |

## 4. Runtime sequence

### Parent session load

```text
session_start / session_switch / session_branch / session_tree
  → reject child-session execution
  → load .omp/pstack.json or pstack.json
  → scan the active parent branch for the latest pstack state snapshot
  → restore state; expose status through /pstack and pstack_status
  → apply --pstack-mode override, if supplied
```

The latest valid custom session entry is the source of truth. Audit files support inspection and recovery, but do not override session state.

### Main-agent turn

```text
before_agent_start
  → no-op in child sessions
  → reconcile known async workers from OMP's job snapshot
  → classify the current prompt or active objective
  → remove the prior pstack policy segment
  → inject one current, bounded policy segment
```

Repeated turns replace rather than duplicate policy text.

### Parent task call

```text
tool_call(task)
  → no-op in child sessions
  → identify pstack agent occurrences
  → compute the target fingerprint when a run is active
  → force strict structured-output mode
  → attach frozen review/verification contracts
  → create a pending call record keyed by toolCallId
```

The rewrite applies only to named pstack roles; arbitrary OMP tasks are not silently modified.

### Subagent spawn

```text
before_subagent_spawn
  → no-op in child sessions
  → map agent name to pstack role
  → reject strict-mode pstack spawn without an active run
  → select configured model-role patterns
  → prefer a different family for review/verification when available
  → associate spawn with the expected task occurrence
  → persist actor provenance before execution
```

OMP's spawn hook does not currently expose the parent task `toolCallId`. The tracker therefore makes a deterministic provisional match by session, expected agent name, occurrence, and call creation order. Runtime agent IDs from task results become the stronger reconciliation key.

### Task result and background work

A `task` tool result is not necessarily terminal. Non-blocking custom agents can return control while OMP reports:

```text
details.async.state = running
progress[].id          = runtime agent id
```

OMP 18.2.11 delivers `structuredOutput` only in a blocking task's `details.results[]`; an async result carries `results: []` and no output (see `test/fixtures/omp-probe-18.2.11`). Every proof-producing agent (`pstack-builder`, `pstack-synthesizer`, `pstack-verifier`) is therefore `blocking: true`. The async path below only tracks provenance and status for the other roles.

`task-lifecycle.ts` follows these rules:

- `async.state=running` keeps the actor `running`;
- an explicit terminal progress/result status wins;
- a synchronous result without async metadata is terminal;
- a tool error marks matched actors failed;
- runtime agent ID and job ID are persisted when available;
- before later turns and session stop, OMP's async-job snapshot is reconciled;
- completion is blocked while task actors are `spawned`, `running`, or `unknown`.

This prevents a background worker from being treated as complete merely because the `task` tool returned control to the parent.

### Structured result ingestion

After lifecycle reconciliation, the parent reads `details.results[].structuredOutput`:

```text
schema-valid builder/synthesizer output
  → reproducible evidence rows are recorded idempotently

schema-valid verifier output
  → correlate runtime result to a recorded verifier actor
  → recompute the current artifact fingerprint
  → ingest evidence with deterministic IDs
  → map reported evidence references to stored evidence IDs
  → apply acceptance outcomes only when the fingerprint matches
  → validate actor roles and writer/verifier separation
  → downgrade an invalid or stale PASS to INCONCLUSIVE
  → record the final verdict in parent state
```

Evidence and verdict IDs are deterministic, so replaying the same task result does not duplicate state.

### Final verification contract

The verifier receives:

- active run ID and objective;
- required acceptance criteria;
- current target fingerprint;
- recorded writer actor IDs;
- a prohibition on editing;
- the project verification skill or explicit product-surface instructions.

It returns strict structured output containing `PASS`, `FAIL`, or `INCONCLUSIVE`, the tested fingerprint, observations, evidence references, limitations, and per-criterion outcomes. It does **not** call a parent state tool.

### Completion

`goal op=complete`, `pstack_gate action=check`, and `/pstack check` evaluate gates while ignoring only the open run status. Gate-only runs must be opened in `auto` or `strict`; gate initialization is refused in `off`. A goal-bound run is closed by OMP's `goal_updated` `complete` event (a `dropped` goal fails the run); a gate-only run is closed by `check`. `session_stop` gates only runs without a live bound goal, and at most `maxStopGateBlocks` times (default `0`: the session ends at once with a warning; the run stays `active`, so nothing passes by stopping). While the goal is in goal mode, OMP's goal continuation owns the keep-working loop and `goal op=complete` is the gate; blocking the stop as well made the model spin in a live 18.2.11 run.

A successful explicit completion marks the run `done`, appends a compact completed-run history record, and allows future session stop.

## 5. State model

The active run contains:

```text
identity and objective
playbook + ceremony
status (active/done/failed) + optional OMP goal ref
acceptance criteria
artifact fingerprints
evidence records
decision records
agent provenance/lifecycle
verdict records
skipped steps
stop-gate attempt count
```

Every mutation appends a full state snapshot as an OMP custom session entry. Full snapshots make branch reconstruction deterministic and avoid replay-version coupling in the 0.1 series. The audit layer separately writes:

```text
.omp/pstack/runs/<run-id>/state.json
.omp/pstack/runs/<run-id>/events.jsonl
```

These paths are ignored by default fingerprinting so recording workflow metadata cannot invalidate its own verdict.

## 6. Trust boundaries

### Coordinator

Owns objective interpretation, decomposition, integration, acceptance, and workflow authority. It may use parent `pstack_*` tools, but may not treat a worker summary as proof.

### Writer

May mutate one isolated artifact/worktree. It can return focused test evidence but cannot grant final PASS or mutate parent run state.

### Reviewer and judge

May inspect and run safe diagnostics. They identify defects or compare candidates against frozen intent, but do not modify the target or grant final verification.

### Verifier

Has no edit/write tools. It evaluates the exact target artifact and returns a schema-valid report. The parent runtime—not the child—records the resulting evidence, acceptance outcomes, and verdict.

### Extension

Enforces structural invariants, not aesthetic judgment. It can prove that a verdict is bound to a digest, that role identities exist, and that required evidence fields are present. It cannot prove that an architecture is elegant or that an inadequate project verification skill exercised every meaningful behavior.

## 7. Fingerprint design

Git mode combines repository identity rather than trusting only `HEAD`. Tracked changes, staged changes, and untracked content can materially change behavior, so they participate in the digest. Non-Git mode performs a deterministic bounded tree hash.

Configured limits protect the runtime from pathological repositories. Crossing a limit does not fabricate certainty: the fingerprint is marked `partial` and records explanatory notes.

## 8. Failure handling

- A failed or cancelled worker is terminal and remains visible in provenance.
- An unresolved/running worker blocks completion.
- A stale PASS remains in history but cannot satisfy current gates.
- A verifier PASS with a missing/stale fingerprint or missing required criterion evidence is ingested as `INCONCLUSIVE`.
- `INCONCLUSIVE` is a first-class non-success state and requires a limitation.
- Pausing is the safe escape hatch when the environment cannot complete required verification; pausing never claims success.

## 9. Why no core OMP fork

OMP already supplies the needed primitives: package extensions, custom agents, model patterns, task isolation, structured outputs, event hooks, custom session entries, and async job inspection. Keeping pstack-OMP as a plugin makes host upgrades and upstream comparison easier.

A core change would only become necessary for guarantees the current API cannot express cleanly, such as an exact parent `toolCallId` on every spawn or an always-on durable worker scheduler that survives the OMP host process.
