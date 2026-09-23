---
name: pstack-create-verification
description: Create or repair a project-local verification skill that teaches pstack how to start the product, seed state, drive real surfaces, capture evidence, and clean up.
---
# Create a project verification skill

Create `.omp/skills/verify-<project>/SKILL.md`. Interview the repository before asking the user: inspect manifests, scripts, CI, test harnesses, containers, examples, fixtures, ports, health checks, and developer docs. Run harmless discovery commands to confirm assumptions.

The resulting skill must contain:

1. **Scope and success contract** — what product/surface it verifies and what it does not.
2. **Preconditions** — dependencies, services, credentials, environment variables, and safe substitutes.
3. **Start** — exact reproducible commands, working directories, readiness checks, and logs.
4. **State setup** — fixtures, migrations, test accounts/data, reset procedure, and idempotency.
5. **Surfaces** — CLI, API, browser, worker/queue, database effects, integrations, or benchmark entry points.
6. **Assertions** — observable outputs mapped to acceptance criteria; include negative/error behavior.
7. **Evidence** — commands, log paths, screenshots, traces, result files, and how to redact secrets.
8. **Fingerprint discipline** — compute before and after verification; explain when generated files mutate the target.
9. **Cleanup** — stop services, remove fixtures, restore configuration, and leave existing user data untouched.
10. **Limitations** — unavailable third-party systems or environment-dependent checks that require INCONCLUSIVE.

Prefer existing project tooling. Add a minimal script only when it makes verification repeatable. Never hide an unavailable real surface behind a proxy test. Validate the generated skill on at least one representative path and one failure path, then record the result as evidence.
