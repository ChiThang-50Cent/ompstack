---
name: ompstack-create-verification
description: Create a repository-grounded OMP-native verification skill and feature map for a real CLI, API, service, library, or web surface. Use only when the user asks to establish verification infrastructure or a task cannot safely name a proof surface and the user extends scope.
---

# Create an OMP-native verification capability

Create reusable project verification knowledge. Do not invent a generic test wrapper, and do not expand a narrow product task into verification-infrastructure work without an explicit trigger.

## 1. Inspect the repository

Establish the observable surface from source and existing project instructions:

- **Surface:** CLI/TUI, API, web UI, service, library consumer API, or desktop/mobile interaction.
- **Launch:** the repository-owned command, readiness signal, required environment, ports, seed data, and authentication.
- **Drive:** an existing harness first. Use Browser through Eval for a web surface, a PTY for CLI/TUI, ordinary HTTP for APIs/services, and a consumer call for libraries.
- **Observe:** response body, terminal transcript, screenshot, side effect, database state, message, or file that proves the user-visible outcome.
- **Isolate:** ports, data directories, user profiles, and external state. Do not double-drive a shared instance.

Ask the user only for an unobservable product choice or unavailable credential. If the repository cannot launch, report the concrete blocker; do not write a skill against a broken base.

## 2. Create the project-local skill

Create one native OMP skill at:

```text
.omp/skills/verify-<surface>/SKILL.md
```

OMP discovers only one level below `.omp/skills`, so do not nest the skill under another category. Give it explicit `name` and `description` frontmatter.

The generated skill must contain these sections, with no placeholders:

1. `## Launch` — exact command, ready condition, and teardown for resources it started.
2. `## Doctor` — a read-only readiness check before every first drive and after surprising behavior.
3. `## Drive` — the real user or consumer path using stable selectors, command arguments, routes, or API calls.
4. `## Evidence` — action plus observable result and evidence location.
5. `## Cleanup` — remove only resources and scratch state the verification run created; evidence survives.
6. `## Helpers` — executable helper names and their documented invocation, if any.

A Doctor returns this concise record:

```text
DOCTOR: READY | BLOCKED
RUNTIME: <version, process, endpoint, or build identity>
CHECKS: <read-only checks actually run>
BLOCKER: <required only when BLOCKED>
```

A Doctor never installs dependencies, changes product data, mutates a remote service, or hides a runtime failure.

## 3. Seed the feature map

Create:

```text
.omp/skills/verify-<surface>/features/README.md
.omp/skills/verify-<surface>/features/<feature>.md
```

Use `skill://ompstack-create-verification/references/feature-map-template.md` for each feature. Cover the top-level user-facing features first. For a library, the consumer API is the surface; do not invent UI coverage.

## 4. Prove the capability once

Execute the new skill end-to-end:

1. Launch.
2. Run Doctor.
3. Drive one mapped feature.
4. Capture the named evidence.
5. Cleanup.
6. Confirm the evidence remains at the named path after cleanup.

Fix the verification skill or its owned helper if this proof fails. Do not modify product behavior during this lifecycle task. A missing external prerequisite is `BLOCKED`, not a completed skill.

## 5. Hand off

Report the project skill path, mapped features, one exercised feature, exact evidence, cleanup result, and any feature still unverified. For later drift, use `skill://ompstack-maintain-verification`.
