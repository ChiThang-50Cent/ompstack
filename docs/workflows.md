# Workflows

## Router and proportionality

The runtime router supplies a recommendation, not a hidden autonomous mandate. The active run freezes the selected playbook and ceremony so execution does not drift every turn. New evidence can justify changing phase or starting a better-scoped run; record the reason.

The public skill contains the routing table and tells the coordinator to load exactly one playbook. Each playbook is written as explicit phases with outputs, delegation opportunities, evidence expectations, and closeout conditions.

## Investigation

```text
frame question
→ scout current behavior/ownership
→ inspect rationale/history when material
→ reconcile facts, inferences, unknowns
→ answer with evidence or transition to implementation
```

Investigation does not silently mutate code. A discovered repair becomes a new bug-fix/feature run.

## Bug fix

```text
reproduce original failure surface
→ freeze reproduction and acceptance
→ trace producer/boundary/consumer path
→ form and eliminate hypotheses
→ create discriminating failing check
→ isolated minimal root-cause fix
→ inspect actual diff
→ independent rerun of original reproduction
```

A test that only restates the implementation is insufficient. The verifier must show the observed defect no longer occurs and relevant negative behavior remains correct.

## Feature

```text
ground existing system
→ name domain state and boundaries
→ architect when crossing modules/contracts
→ slice ownership and done predicates
→ isolated implementation
→ integration/review
→ real-surface verification
```

Direct local additions may skip a separate architect with a recorded reason. Cross-boundary state, public API, concurrency, or migrations should not.

## Empirical prototype

Use when the uncertainty is observable rather than preferential:

```text
state competing hypotheses
→ define discriminating measurement
→ build the smallest reversible prototype
→ run/observe
→ choose based on evidence
→ discard or promote cleanly
```

Do not ask the operator to guess latency, compatibility, layout behavior, or library semantics that the harness can measure.

## Performance

Requires baseline, controlled workload, instrumentation, candidate change, repeated measurement, and regression/variance notes. “Feels faster” is not evidence. Preserve correctness verification separately from metric improvement.

## Refactor

Freeze behavior and interfaces first. Prefer structural reduction, caller migration, and deletion over compatibility layers. Verify behavior and inspect the final diff for hidden semantic changes.

## Migration

Define old/new representations, transition states, ownership, idempotency, rollback, compatibility window, backfill, and observability. Migration/security/incident playbooks always escalate to strict unless program-scale.

## Review / interrogate

All reviewers receive the same frozen intent, actual artifact, rubric, and output schema. Diversity should come from independent context/model execution rather than arbitrary role-play. Findings need location, trigger, impact, evidence, and remediation. The coordinator classifies findings; it does not blindly apply every suggestion.

## Arena

```text
frame one artifact and one rubric
→ produce isolated candidates without auto-apply
→ blinded same-rubric judge
→ choose one base
→ specify bounded grafts
→ one synthesizer creates coherent final artifact
→ independent verification of final artifact
```

Candidate votes are not runtime proof. Verification occurs after synthesis because the combined artifact is new.

## Multi-phase

OMP owns the long-running loop (goal mode, TODO, plan). Pstack keeps the proof state durable across it:

- persist objective, criteria, decisions, agents, and fingerprints;
- checkpoint after each verifiable unit;
- use file pointers rather than flooding parent context;
- pause the OMP goal when environment or authorization blocks progress; a live or paused goal never trips the stop gate.

It does not provide a host-independent daemon. See limitations.

## Shipping

The bundled playbook describes stacked-PR semantics, including independent patch/head-bound verdicts and contiguous verified landing. The 0.1.0 extension does not call GitHub or merge PRs. It supplies the run/evidence/verdict substrate; repository-specific shipping automation should remain a separate explicitly authorized layer.

## Security

Threat-model assets, trust boundaries, attacker-controlled inputs, sensitive sinks, and negative cases before implementation. The verifier should exercise the security property where safe and authorized; a code-review panel alone is not proof.

## Documentation

Documentation is an artifact with readers and runnable claims. Verify commands, links, examples, version assumptions, and behavior against the actual project. Prose-only tasks can avoid runtime verdicts at standard ceremony; strict/program documentation still requires independent checking.

## Eval

Use `eval` for a blinded comparison of variants, not for a single test run:

```text
freeze variants, organic prompt, and weighted rubric
→ create sanitized isolated workspaces
→ run one OMP task batch with identical worker prompts
→ judge sanitized outputs under one rubric
→ inspect transcripts and artifacts
→ synthesize a recommendation and independently verify any new artifact
```

Workers never see the rubric or other worker identities. Candidate votes do not transfer to a synthesized artifact.

## Hillclimb

Use `hillclimb` for iterative improvement of one metric. Freeze the workload and harness first:

```text
ground workload and one metric
→ prove the harness separates realistic cases
→ capture baseline and regression gate
→ run one hypothesis and one bounded change
→ measure, inspect, keep or revert
→ record evidence and commit accepted wins
```

Never claim a win from code inspection. A first improvement is not the stop condition when cheap hypotheses remain.

## Trace forensics

Use `trace-forensics` when the capture already exists and the task is read-only diagnosis:

```text
identify format and load artifact
→ reduce large data into a queryable shape
→ query hot path, retainer chain, or blocked thread
→ map frames to source
→ compare paired captures when available
→ return cited diagnosis without applying a fix
```

Without a paired capture, report the strongest artifact-supported hypothesis rather than a confirmed cause.

## Runtime forensics

Use `runtime-forensics` when the process is live and the signal must be captured rather than inferred:

```text
capture CPU/heap/CDP signal on the real surface
→ reduce it to the smoking gun
→ prove the mechanism with safe runtime instrumentation
→ map the finding to source
→ return a cited diagnosis without applying a fix
```

Distinguish this from `trace-forensics`, which reads a capture that already exists.
