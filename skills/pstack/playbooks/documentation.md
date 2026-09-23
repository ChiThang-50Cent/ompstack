---
name: pstack-documentation
description: Produce technical documentation that is structurally accurate, runnable where applicable, audience-specific, and verified against the current artifact.
---
# Documentation playbook

Produce technical documentation that is structurally accurate, runnable where applicable, audience-specific, and verified against the current artifact.

**When to use:** Use when README, guide, RFC, runbook, API documentation, or migration instructions are the primary deliverable.

## Procedure

### 1. Define audience and job

- Name reader, prerequisite knowledge, task/outcome, scope, and freshness boundary.
- Choose document type and information architecture.
- Record claims that require code/runtime verification.

### 2. Ground facts

- Trace current commands, interfaces, configuration, defaults, examples, and failure behavior from primary sources.
- Run examples and commands when safe.
- Do not copy stale comments or old docs as authority.

### 3. Draft structure

- Lead with reader outcome and progressive disclosure.
- Use precise names, short runnable examples, and explicit prerequisites/cleanup.
- Separate normative contract from explanation and troubleshooting.

### 4. Review

- Check technical correctness, missing steps, ambiguity, security implications, and reader load.
- Have a reviewer follow instructions against the actual repository where feasible.
- Reject prose improvements that alter technical meaning.

### 5. Verify examples

- Execute code blocks/commands or validate them mechanically.
- Confirm links/paths/versions and expected output.
- Record environmental examples that cannot be run.

### 6. Close

- Bind documentation claims to the current fingerprint/version.
- Add ownership/freshness cues when appropriate.
- Complete only when required examples and procedures are reproducible.

## Agent topology

Scout for facts -> builder/writer for bounded document -> reviewer as target reader -> verifier for runnable examples and procedures.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

Claims match current primary sources, runnable instructions have been exercised, audience can complete the named job, and limitations are explicit.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
