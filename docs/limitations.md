# Limitations and non-claims

## Verified in the delivery build

- strict TypeScript compilation against the documented API subset;
- state/gate/model/fingerprint/task-rewrite logic;
- mock OMP extension registration and end-to-end workflow;
- parent/child extension-session isolation;
- strict structured-output ingestion and replay idempotency;
- concurrent task correlation;
- async worker remains pending until job-snapshot terminal state;
- agent/skill/schema/manifest integrity;
- negative-topology fixture coverage.

## Not verified in the delivery container

The delivery container could not resolve GitHub and did not contain an installed OMP/Bun runtime or configured model provider. Therefore a true host process was not launched there. The repository includes `npm run verify:omp` so the target machine can perform version/API preflight and an opt-in model-backed smoke.

Do not interpret mock integration tests as proof against every future OMP release.

## Spawn-to-tool correlation

The current `before_subagent_spawn` event identifies the agent, invocation kind, model patterns, and spawn key, but not the parent task's `toolCallId`. The plugin provisionally correlates by expected agent occurrence and task call order, then stores runtime agent IDs reported by task progress. This is robust for normal task dispatch and covered for concurrent distinct-agent calls; pathological interleaving of multiple identical-agent calls before spawn remains an upstream-observability limit.

A future OMP hook field carrying parent `toolCallId` should replace this heuristic.

## Multi-day autonomy

Session state is durable in OMP session entries, and agent/job history can be reconciled while exposed by the runtime. Version 0.2.0 does not include:

- an external SQLite job queue;
- an always-on worker daemon;
- distributed locking/leases;
- automatic recovery after the entire OMP host and provider run disappear;
- GitHub PR merge automation.

Program playbooks coordinate long work but should not be described as host-independent autonomous execution.

## Semantic enforcement

Mechanical gates can validate structure:

- actor identity separation;
- status terminality;
- evidence references;
- verdict enum;
- fingerprint freshness.

They cannot mechanically prove:

- the acceptance criteria are sufficient;
- a test surface represents production;
- a model did not overlook a defect;
- an architecture is simple or correct;
- two model families fail independently.

Human review, CI, protected branches, security policy, and deployment authorization remain external controls.

## Tool allowlists and child guard

OMP agent `tools:` declarations are not treated as a security sandbox: host versions can auto-add baseline or extension tools such as `hub`, `yield`, or extension-registered tools. Pstack-OMP therefore applies a child-session `tool_call` guard that blocks `pstack_*`, nested `task`, `hub`, and direct file mutators for non-writing roles; it also blocks Bash for scout/architect/judge roles that did not request it.

The guard is name- and event-based, not process isolation. Reviewer/verifier Bash can still alter files or external state through arbitrary commands, and browser/computer tools can mutate remote systems. Project verification skills must name safe environments, permitted fixtures, cleanup, and irreversible boundaries.

## Fingerprint bounds

Very large/non-Git repositories may produce a partial fingerprint. Ignored paths can hide behaviorally relevant files if configured incorrectly. Git submodules, LFS, generated outputs, external services, container images, and database state require separate evidence.

## Completion gate escape paths

The operator can set mode `off`, drop or pause the OMP goal, or abandon the run. This is intentional human authority, not a security boundary. Audit/session history makes the transition visible but does not prevent an authorized operator from bypassing workflow.


## Parent/child state boundary

OMP binds extension modules again inside custom-agent child sessions. Pstack intentionally treats child sessions as non-authoritative: they do not inject pstack policy, hydrate parent run state, rewrite nested tasks, or write verdict/evidence records. Child agents return schema-validated output and the parent extension performs ingestion.

Detection uses only the persisted `session_init` child contract, which OMP writes before the child's first tool call. A session whose entries cannot be read is classified `unknown` and may not touch parent state. A future OMP change to that entry could require an adapter update; the bundled host smoke and child-session tests are intended to surface that incompatibility.

## Structured-output dependency

Automatic evidence and verdict ingestion depends on OMP returning `details.results[].structuredOutput` for custom-agent task results. Invalid or missing verifier structured output cannot satisfy completion gates. The parent records a warning and leaves verification incomplete rather than inferring success from prose.
