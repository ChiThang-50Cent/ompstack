---
name: ompstack-decision-trail
description: Keep a compact append-only evidence trail for high-risk, autonomous, multi-phase, or handoff engineering work. Use when a later reviewer needs to reconstruct material decisions without replacing OMP transcripts and artifacts.
---

# Ompstack decision trail

Use a decision trail for material forks and proof checkpoints, not every tool call. It supplements OMP's `history://`, `agent://`, Artifact Manager, and Agent Hub; it does not create another session database.

## Format

Default path:

```text
.omp/audit/<task-slug>.tsv
```

The trail is uncommitted by default. Do not modify repository ignore rules. A project may choose its own tracking policy for this path.

Columns are fixed:

```text
ts	phase	decision	why	evidence	result
```

- `decision` — what was chosen or completed.
- `why` — concrete reason, not a policy label.
- `evidence` — a resolvable pointer: `file:line`, test artifact, trace, screenshot, commit, `agent://`, or `history://`.
- `result` — a real predicate or state such as `tests green`, `reverted`, `BLOCKED`, `INCONCLUSIVE`, or `open`.

Append a row through:

```text
bun <ompstack-plugin-root>/scripts/append-decision-trail.mjs \
  .omp/audit/<task-slug>.tsv <phase> <decision> <why> <evidence> <result>
```

The helper creates the header once, flattens cell newlines/tabs, and only appends. It does not rewrite or delete history.

## When to use it

Open a trail for autonomous, multi-phase, high-risk, explicit handoff, or contested design work. Skip it for a narrow local task unless the user asks for an audit record.

Record a route selection, design fork, shared contract, verification checkpoint, revert, blocker, or accepted reviewer finding. Do not log speculative work or copy prose summaries into the evidence column.

## Audit before delivery

Before final reporting:

1. Read the trail in order.
2. Resolve each evidence pointer against a real artifact, transcript, or source location.
3. Add a superseding row if a decision or verdict proved wrong. Never revise an existing row.
4. Name gaps or unresolved evidence in the final report.

Use independent review only where the primary ompstack route already requires it. A decision trail is evidence organization, not a reason to add agent ceremony.
