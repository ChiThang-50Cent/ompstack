---
name: pstack-security
description: Threat-model and implement a security-sensitive change with explicit trust boundaries, attacker paths, safe validation, and independent verification.
---
# Security playbook

Threat-model and implement a security-sensitive change with explicit trust boundaries, attacker paths, safe validation, and independent verification.

**When to use:** Use for authentication, authorization, secrets, untrusted input, cryptography, isolation, supply chain, or vulnerability repair.

## Procedure

### 1. Frame assets and adversary

- Name protected assets, trust boundaries, attacker capabilities, entry points, and unacceptable outcomes.
- Distinguish realistic threat model from generic checklist.
- Define disclosure and sensitive-evidence handling.

### 2. Trace attack paths

- Use inspect-only scouts and treat reviewer Bash as shell-capable while following untrusted sources to controls and sinks.
- Inspect default-deny behavior, confused deputy risks, tenant/user boundaries, and failure paths.
- Require a credible execution path for every candidate issue.

### 3. Design controls

- Validate/parse at boundaries, keep internal types trustworthy, minimize privileges, and fail closed.
- Prefer standard primitives and existing project security mechanisms.
- Record residual risk and compatibility impact.

### 4. Implement safely

- Use isolated bounded builder; avoid handling real secrets in prompts/logs.
- Add behavior tests for exploit path and legitimate use.
- Do not create operational payloads beyond safe local proof needed for the authorized repository.

### 5. Independent security review

- Give actual diff and threat model to pstack-reviewer or project security reviewer.
- Validate high-severity findings with source evidence.
- Fix root cause; avoid blacklist-only symptom patches.

### 6. Verify and disclose

- Exercise negative/positive behavior on final fingerprint.
- Check logs/errors do not leak sensitive data.
- Pause before public disclosure, production rotation, or customer communication.

## Agent topology

Security-focused scouts/reviewers -> architect -> isolated builder -> independent verifier. Different model/context is preferred for review.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

Threat model and trust boundaries are explicit, exploit/root cause is addressed, legitimate behavior still works, sensitive evidence is controlled, and final artifact is independently verified.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
