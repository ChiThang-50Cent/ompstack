---
name: pstack-incident
description: Stabilize an active operational failure while preserving evidence, minimizing harm, identifying root cause, and verifying recovery.
---
# Incident playbook

Stabilize an active operational failure while preserving evidence, minimizing harm, identifying root cause, and verifying recovery.

**When to use:** Use for outages, severe degradation, security operational events, or live data/process failures.

## Procedure

### 1. Declare and bound

- Capture impact, start time, affected population, current signals, and decision owner.
- Protect evidence and avoid destructive cleanup.
- Separate immediate containment from permanent repair.

### 2. Stabilize

- Choose the safest reversible containment with explicit blast radius.
- Record every action, timestamp, observation, and rollback path.
- Pause for production/deployment/data actions unless the operator has granted authority.

### 3. Diagnose in parallel

- Assign scouts by telemetry, recent changes, dependencies, and reproduction.
- Maintain a hypothesis table with supporting/refuting evidence.
- Do not let the coordination channel fill with raw logs; store artifacts and summarize.

### 4. Recover

- Apply the smallest supported mitigation or repair.
- Verify service health and user outcomes, not only dashboards.
- Watch for recurrence and secondary damage.

### 5. Root cause and prevention

- Trace the earliest violated control/invariant.
- Distinguish trigger, contributing conditions, detection gap, and response gap.
- Encode prevention as tests, monitors, runbooks, or structural changes—not only prose.

### 6. Close

- Independent verifier checks recovery criteria and evidence.
- Produce a concise timeline and unresolved risks.
- Transition follow-up engineering work to bug-fix/feature/migration with separate acceptance.

## Agent topology

Coordinator remains primary. Parallel read-only scouts are preferred during diagnosis; builders are bounded; verifier checks recovery independently.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

Impact is objectively recovered, containment side effects are known, timeline/evidence is durable, and root-cause claims are distinguished from hypotheses.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
