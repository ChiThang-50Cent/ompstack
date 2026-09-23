---
name: pstack-dependency-upgrade
description: Upgrade a package, runtime, framework, or toolchain with source-backed change analysis, compatibility migration, and end-to-end verification.
---
# Dependency Upgrade playbook

Upgrade a package, runtime, framework, or toolchain with source-backed change analysis, compatibility migration, and end-to-end verification.

**When to use:** Use for version bumps, ecosystem migrations, security updates, or replacing a dependency.

## Procedure

### 1. Inventory and motive

- Record current/target versions, why the upgrade is needed, direct/transitive use, and supported environments.
- Read official release notes, migration guides, and advisories for the exact range.
- Freeze lockfile/package-manager expectations.

### 2. Map affected contracts

- Search imports, configuration, generated code, plugins, runtime assumptions, and public APIs.
- Identify breaking/deprecated behavior and default changes.
- Separate mandatory migration from opportunistic cleanup.

### 3. Prototype compatibility

- Create a branch/worktree and perform the minimal version/lock change.
- Run install/build/startup and representative paths.
- Capture warnings and failures before editing callers.

### 4. Migrate callers

- Use bounded builders by ownership when disjoint.
- Adopt target APIs; delete obsolete compatibility paths.
- Keep lockfile changes deterministic and inspect transitive deltas.

### 5. Review risk

- Check supply-chain provenance, licenses where relevant, config/security defaults, bundle/runtime size, and rollback.
- Review generated and deployment artifacts.
- Avoid trusting release-note summaries alone when behavior can be run.

### 6. Verify

- Run full affected build/test/runtime surfaces on supported environments where available.
- Confirm target version at runtime and absence of old dependency path.
- Independent verifier binds PASS to source plus lock/generated artifacts.

## Agent topology

Scouts for release/source research and usage inventory -> architect if APIs change broadly -> builders -> reviewer -> verifier.

Every delegation must freeze objective, ownership, output schema, done predicate, prohibited actions, and evidence contract. Parallel writers require separate worktrees or artifacts.

## Evidence and state

- Keep the parent TODO aligned with these phases.
- Record skipped steps with a reason; absence of ceremony is a decision, not an invisible omission.
- Record commands, observations, artifacts, and decisions with pstack tools.
- Recompute the artifact fingerprint after any edit or synthesis.
- PASS belongs only to the independent verifier and only to the tested fingerprint.

## Completion gate

Exact version range is understood, all callers/configs migrate, lock/generated artifacts are reviewed, supported runtime behavior passes, and rollback/residual risk is documented.

Finish with `goal op=complete` when an OMP goal is active, otherwise close the run with `pstack_gate action=check`. If the gate refuses, keep working or abandon with `pstack_gate action=abandon` and a concrete reason. Do not relabel FAIL or INCONCLUSIVE as success.
