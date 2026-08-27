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
| live/real-surface verification | custom `ompstack-verifier` because bundled reviewer is read-only and does not run the verification workflow |
| read-only explanation or recommendation | parent direct inspection; bundled `scout` only for broad unknown discovery |
| behavior-preserving refactor | `ompstack` Refactoring playbook with a pre-edit behavior pin |
| empirical design/interaction/timing fork | `ompstack` Prototype playbook and matching-surface observation |
| fan-out/swarm | native `tasks[]` batching, risk-gated rather than always-on |
| context control | one shared batch `context`, self-contained task contracts, `local://` references for bulky payloads |
| per-role models | OMP role aliases such as `@slow`, `@task`; no model vendor pinned in the package |
| worktree-like isolation | native `isolated` task field only when exposed/configured by the current OMP runtime |
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

The bundled reviewer is intended for independent patch review and is read-only. Behavioral verification needs permission to execute targeted commands and drive matching browser flows while still forbidding edits. That is a distinct tool/behavior boundary, so a small custom agent is justified.

## Playbook boundary

The port keeps only workflow distinctions that OMP can execute natively:

| pstack workflow | ompstack route |
| --- | --- |
| investigation | Read-only evidence and recommendation. It never opens a write lane. |
| feature | New or intentionally changed behavior, named data shape, and bounded write ownership. |
| refactoring | Structure-only work. Pin observable behavior before edits; migrate callers and delete the superseded path in the same change. |
| prototype | A disposable probe for one empirical decision. It is not production code. |
| bug fix | Reproduce, identify the mechanism, fix narrowly, and prove the same surface. |

All behavior-affecting routes name the closest available real proof surface. Tests, typechecks, and builds support that evidence; they cannot replace a browser flow, CLI/API behavior, migration replay, or equivalent runtime observation.

For a contested design, one or two `ompstack-architect` tasks may be sent in the same `tasks[]` batch with identical decision criteria. `blocking: true` gates the parent before writes but does not promise serial execution inside a batch. When batching is unavailable, use one architect rather than claim false parallelism.

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

## State and verdicts

A verdict is scoped to the current diff/worktree it actually inspected. After an accepted finding changes behavior-affecting code, rerun the original deterministic evidence and only the independent lanes whose claims may have become stale.

This preserves pstack's useful 'fresh verdict after fix-forward' principle without requiring a GitHub/PR automation layer.
