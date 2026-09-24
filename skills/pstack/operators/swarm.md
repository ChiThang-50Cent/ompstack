# Operator: Swarm

Fan out N parallel workers, drain them, and return one report. Workers may cover separate slices, race the same brief, or mix both. The parent waits, aggregates, and remains accountable for the report.

## Start

Open a todolist with one entry per phase before launching anything:

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape: partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Set N from the user or derive it from the shape. N is total workers, not a host concurrency limit.
4. Choose the OMP agent by artifact type: `pstack-scout` for read-only evidence, `pstack-builder` for a bounded owned artifact, or another named pstack agent whose contract fits the slice. Do not invent a generic cloud worker or provider model.
5. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs and method (sample count, what one sample is, and order). The worker records both in its result.

## Phase B: Fan out

Spawn all N workers in **one `task` batch**. Every brief stands alone and includes the goal, scope, exact slice or race arm, how to verify, and what to report. Use `isolated: true` only when the OMP configuration enables task isolation; otherwise use disjoint output paths and say that isolation was unavailable. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that proves a defect reports every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Wait for terminal results through the OMP wait surface. Drop a result that does not record the SHAs and method its brief names, and rerun that worker once when possible. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front.

Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts. Do not paste raw worker dumps into the parent context.

## Phase D: Report

Return one consolidated report with the table, issue one-liners, gaps or dropouts, the race rule when used, and the observed isolation mode. The parent owns any follow-up implementation or state mutation.
