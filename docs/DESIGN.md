# Design: pstack ideas mapped onto OhMyPi primitives

## What changed from the first attempt

The first attempt incorrectly rebuilt several roles that OhMyPi already provides. This version treats the official OMP docs as the contract and composes native primitives instead.

| pstack concept | OMP-native mapping in this fork |
| --- | --- |
| front-door mode/router | `ompstack` skill + optional `/ompstack` file command |
| broad codebase exploration | bundled `scout` only when files/path are unknown |
| general implementation owner | bundled default `task` worker; omit `agent` in task items |
| architecture comparison | custom `ompstack-architect` because this is a workflow-specific role |
| static independent code review | bundled `reviewer` |
| security review | bundled `security-reviewer` |
| live/real-surface verification | custom trusted `ompstack-verifier`, instructed not to edit, because bundled reviewer does not run the verification workflow |
| project-local verification capability | native `.omp/skills/verify-<surface>/SKILL.md`, discovered ahead of plugin skills |
| feature coverage map | `verify-<surface>/features/` user-POV map |
| readiness/Doctor | capability-owned read-only check before live drive |
| verification maintenance | `ompstack-maintain-verification` skill and command, constrained to verification artifacts |
| decision trail | optional append-only `.omp/audit/<task-slug>.tsv` with OMP artifact/transcript pointers |
| read-only explanation or recommendation | parent direct inspection; bundled `scout` only for broad unknown discovery |
| behavior-preserving refactor | `ompstack` Refactoring playbook with a pre-edit behavior pin |
| empirical design/interaction/timing fork | `ompstack` Prototype playbook and matching-surface observation |
| measured performance regression | `ompstack` Performance issue playbook with baseline and post-change measurement |
| live runtime diagnosis | `ompstack` Runtime forensics playbook with captured live evidence |
| captured profile diagnosis | `ompstack` Trace forensics playbook with artifact-scoped evidence |
| workflow-policy evaluation | `ompstack` Eval playbook, deterministic contract checks, and paired behavioral evaluation |
| fan-out/swarm | native `tasks[]` batching through a queue overlay, risk-gated rather than always-on |
| Task/Hub fan-in | parent-owned required lane set with per-lane acceptance predicates; auto-delivery, `hub`, `agent://`, `history://`, and artifacts provide observation/evidence |
| execution progress | native parent-owned `todo` working set when eligible; unavailable or existing unrelated Todo falls back to no Ompstack-owned tracking |
| context control | one shared batch `context`, a structured preflight contract, self-contained task contracts, `local://` references for bulky payloads |
| per-role models | OMP role aliases such as `@slow`, `@task`; no model vendor pinned in the package |
| worktree-like isolation | native per-task `isolated` field when useful; OMP may also auto-isolate eligible tasks, so the parent inspects result metadata and the target worktree |
| PR/merge gate | produce evidence/verdict only; do not merge unless user explicitly asks |


## Why there is no custom owner agent

OMP already ships a general-purpose `task` agent with write tools and delegation support. The official task interface also treats the default worker as implicit: implementation tasks should omit the `agent` field unless a specialized agent is required.

Duplicating that role would create another prompt to maintain, increase drift from OMP defaults, and make model-role configuration harder.

## Why there is no custom scout/reviewer/security-reviewer

These are bundled agents with explicit contracts. Reusing them keeps the workflow aligned with future OMP changes and reduces prompt duplication.

## Why two custom agents remain

### `ompstack-architect`

This is a workflow-specific read-only role. It exists only to make architecture comparison a deliberate escalation step rather than asking the implementation worker to design and build at the same time on high-risk changes.

### `ompstack-verifier`

The bundled reviewer is intended for independent patch review and is read-only. Behavioral verification needs permission to execute targeted commands and drive matching browser flows through OMP's Eval prelude. The custom verifier is therefore a trusted role instructed not to edit, not a write sandbox: Bash and Eval retain their normal process permissions.

## Playbook boundary

The port keeps only workflow distinctions that OMP can execute natively:

| pstack workflow | ompstack route |
| --- | --- |
| investigation | Read-only evidence and recommendation. It never opens a write lane. |
| feature | New or intentionally changed behavior, named data shape, bounded write ownership, and an explicit preflight contract. |
| refactoring | Structure-only work. Pin observable behavior before edits; migrate callers and delete the superseded path in the same change. |
| prototype | A disposable probe for one empirical decision. It is not production code. |
| bug fix | Reproduce, identify the mechanism, fix narrowly, and prove the same surface. |
| performance issue | Measure a baseline and the same workload after a targeted optimization. |
| runtime forensics | Diagnose a live symptom from an artifact and a mechanism check; it does not edit source. |
| trace forensics | Diagnose a provided trace/profile artifact and name the evidence needed for causality. |
| workflow evaluation | Validate this plugin's contract and compare policy changes before promotion. |

Queue is an execution overlay applied after selecting a primary route. Verification is a post-change phase, or a phase paired with Investigation for a standalone read-only verification request. Native Todo is a separate conditional parent progress layer: it does not choose a route, replace queue topology, mirror task/Hub lifecycle, or become an audit log.

For Medium, High, and Critical write work, the parent records primary route, execution overlays/phases, progress tracking, risk, proof surface, write ownership, shared-contract owner, independent-evidence lane, and—when parallel—the required lane ids, acceptance predicates, and evidence locations. A task launch or successful yield is not fan-in: the parent reconciles every expected result, inspects its artifact/output, resolves failure, abort, missing output, or truncation, then synthesizes and runs the shared gate once. `hub wait` wakes on the first event or window, not on global completion; Hub remains a supervision surface, never an evidence oracle. Session artifacts and the optional decision trail, not Todo, retain durable handoff evidence. Every shared type, schema, or API has exactly one write owner; the parent owns integration.

All behavior-affecting routes name the closest available real proof surface. Tests, typechecks, and builds support that evidence; they cannot replace a browser flow through Eval, CLI/API behavior, migration replay, or equivalent runtime observation.

For a contested design, one or two `ompstack-architect` tasks run in a design-only batch with identical decision criteria. The parent synthesizes their results before opening a separate implementation batch. A blocking item does not prevent non-blocking siblings in the same batch from starting.

## Verification capability lifecycle

Verification is a maintained project capability, not merely a final task instruction. A behavior-affecting route first prefers a matching native `.omp/skills/verify-<surface>/SKILL.md`, then an existing repository proof surface. Creating a capability is explicit scope, not mandatory ceremony for a narrow change.

Each capability names Launch, Doctor, Drive, Evidence, Cleanup, and any executable Helpers. Its feature map records user-POV access, driving recipe, observable end state, and constraints. Doctor is read-only and reports `READY` or `BLOCKED`; a blocked runtime is a verification gap, not a product verdict.

`ompstack-maintain-verification` audits source coverage and live drives without modifying product code. It distinguishes documentation drift, harness gap, product gap, and unavailable prerequisite. Long-running or handoff work may keep an append-only decision trail that points to OMP `history://`, `agent://`, and artifact evidence rather than introducing a second session store.


## Deliberate omissions

Do not port pstack's Cursor-specific cloud loops, persistent session handoff, Graphite stacks, PR babysitting/landing, vendor model panels, or duplicate owner/scout/reviewer agents. OMP's built-in `task`, `scout`, `reviewer`, and `security-reviewer` remain the native roles. `@slow` and `@task` are operator-remappable OMP role aliases, not package model requirements.

## Token policy

The fork is deliberately asymmetric:

```text
LOW      parent + deterministic gate
MEDIUM   parent/task + deterministic gate + one independent lane
HIGH     bounded design if needed + task + deterministic gate + reviewer + verifier
CRITICAL HIGH + security reviewer when relevant
```

Additional agents are an escalation response, not a default ritual.

This also follows OMP's task guidance: favor one-pass agents that investigate and edit, avoid scout when targets are already known, and avoid repeating full format/lint/test work in every parallel worker.

## Optional unattended evidence adapter

A model verifier remains an advisory, read-only lane. It cannot make a completion decision: Bash and Eval are not a sandbox, and a prose verdict is not an oracle result.

The optional external controller owns a separate run directory with append-only JSONL lifecycle records and one evidence file per attempt:

```text
QUEUED → EXECUTING → ORACLE_RUNNING → VERIFIED
                                  └→ NOT_VERIFIED → REPAIRING → EXECUTING
                                  └→ INCONCLUSIVE
```

`NOT_VERIFIED` means a complete, integrity-valid oracle ran and a declared predicate failed. Timeout, malformed or missing oracle output, zero executed tests, truncated output, worker failure, and candidate/protected-path mutation are `INCONCLUSIVE`; they never trigger automatic retry.

The controller permits one optional repair attempt only. It never automatically retries timeout, integrity, or malformed-oracle failures.


Every evidence record binds contract digest, oracle command digest, candidate snapshot digest, runtime identity, and the caller-declared trust level. `VERIFIED` is valid only while the candidate snapshot and contract digest remain current. A later behavior-affecting edit makes the result stale and the controller's freshness check rejects completion.

This is a bounded control plane, not a general agent framework or a security claim. A same-host `convenience` run remains user-writable. `isolated` or `ci-attested` becomes credible only when an executor, oracle, and artifact store outside the candidate boundary own that run.
