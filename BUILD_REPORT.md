# Build and verification report

## Release identity

- Package: `pstack-omp` 0.4.0
- Delivery date: 2026-09-24
- Minimum supported OMP: 18.2.11
- State schema: version 2
- License: MIT; upstream pstack attribution is recorded in `NOTICE.md`

## Implemented scope

- Thirty task playbooks, twelve operators, twenty-three principles, fifteen reusable workflow skills, and twelve capability-separated custom agents.
- Parent-owned durable state and human-readable audit snapshots.
- Strict child structured-result ingestion; child agents never write parent pstack state.
- Child-session runtime guards for parent-state `pstack_*` and `hub`; OMP `tools:` admission handles other capabilities.
- Builder/synthesizer isolation requests, structured warnings/checkpoints when OMP does not apply task isolation, concurrent/background task lifecycle reconciliation, artifact fingerprints, role-based model routing, independent verification, and completion gates.
- Eight strict structured-output schemas, two project-verification examples, twelve seeded negative-topology fixtures, and a seventy-seven-case router evaluation corpus.

## Offline verification results

The latest repository check was:

```text
npm run check
```

Results:

- TypeScript compilation: PASS (`tsc` 5.9.3)
- Node test suite: PASS, 59/59 tests
- Router corpus: PASS, 77/77 cases
- Asset validation: PASS
  - 12 agents
  - 30 playbooks
  - 12 operators
  - 23 principles
  - 77 evaluation cases
- Upstream map: PASS, 94 pinned entries at `12d587d`
- NOTICE generation/check: PASS, 93 imported entries

## Host verification matrix

`npm run test:host:matrix` passed every listed scenario on both supported host versions:

| Scenario | OMP 18.2.11 | OMP 18.3.0 |
|---|---:|---:|
| async-pending | PASS | PASS |
| builder-isolation-branch | PASS | PASS |
| builder-isolation-off | PASS | PASS |
| builder-noroles | PASS | PASS |
| capture-child-tools | PASS | PASS |
| capture-writer-tools | PASS | PASS |
| child-scout-spawn | PASS | PASS |
| child-xd-guard | PASS | PASS |
| comment-sicko | PASS | PASS |
| gate-blocks-auto | PASS | PASS |
| gate-blocks-strict | PASS | PASS |
| gate-off-mode | PASS | PASS |
| judge-b | PASS | PASS |
| panel-interrogate | PASS | PASS |
| policy-off | PASS | PASS |
| status-auto | PASS | PASS |
| verifier-pass | PASS | PASS |
| verifier-stale | PASS | PASS |

`test/host/known-failing.json` is `[]`. The detailed T0.6 child-tool capture tables, including offered tools per agent and writer probes, are in [docs/port-notes/child-tool-capture.md](docs/port-notes/child-tool-capture.md); both `capture-child-tools` and `capture-writer-tools` passed on both versions.

## Build environment

```text
Linux x86_64
Node.js v23.11.1
npm 11.17.0
TypeScript 5.9.3
```

## Repository inventory

The checked tree contains 30 playbook files, 12 operator files, 23 principle files, 12 pstack agent files, 8 output schemas, 13 Node test files, and 77 router cases.

## Packaged-artifact verification

The release procedure uses `npm pack --ignore-scripts`, extracts the exact tarball into a clean temporary directory, installs its declared dependencies without audit scripts, and reruns `npm run check`. The final release evidence records the resolved Node, npm, TypeScript, and OMP versions in `docs/port-notes/progress.md`.

## Runtime verification boundary

The real host matrix above covers OMP 18.2.11 and 18.3.0 with the offline mock provider. `npm run verify:omp` remains the version/API preflight and `PSTACK_LIVE_SMOKE=1 npm run verify:omp` is the opt-in provider-backed smoke; neither is a claim about every future provider or model.

## Important guarantees and non-guarantees

The offline suite verifies state reduction, routing, task rewriting, parent/child session boundaries, structured result ingestion, stale-fingerprint handling, provenance, asynchronous lifecycle reconciliation, child role guards, and completion-gate behavior against a mock OMP extension host. The host matrix verifies the listed live OMP surfaces, not every future host configuration.

It does not turn OMP child agents into an operating-system sandbox. In particular, reviewer/verifier Bash commands, browser automation, network access, and external services must still be constrained by the host environment. The plugin provides workflow enforcement and defensive tool guards, not process/container isolation.

Program playbooks coordinate long work inside the available OMP runtime; they do not provide an always-on daemon, distributed leases, or automatic recovery after host and provider disappearance.
