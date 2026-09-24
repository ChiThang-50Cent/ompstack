# Build and verification report

## Release identity

- Package: `pstack-omp` 0.4.0
- Delivery date: 2026-09-24
- Minimum supported OMP: 18.2.11
- State schema: version 2
- License: MIT; upstream pstack attribution is recorded in `NOTICE.md`

## Implemented scope

- Sticky `off`, `auto`, and `strict` modes.
- Sixteen playbooks, twelve operators, and twenty-three principles.
- Seven capability-separated custom agents.
- Parent-owned durable state and human-readable audit snapshots.
- Strict child structured-result ingestion; child agents never write parent pstack state.
- Child-session runtime guards for parent-state `pstack_*` and `hub`; OMP `tools:` admission handles other capabilities.
- Builder/synthesizer isolation requests, provenance, and warnings when OMP does not apply task isolation; concurrent/background task lifecycle reconciliation, artifact fingerprints, role-based model routing, independent verification, and completion gates.
- Eight strict structured-output schemas, two project-verification examples, twelve seeded negative topology fixtures, and a thirty-three-case router evaluation corpus.

## Offline verification results

The final source tree was checked with:

```text
npm run check
```

Results:

- TypeScript compilation: PASS (`tsc` 5.8.3)
- Node test suite: PASS, 42/42 tests
- Router corpus: PASS, 33/33 cases
- Asset validation: PASS
  - 7 agents
  - 16 playbooks
  - 12 operators
  - 23 principles
  - 33 evaluation cases
- Shell syntax validation: PASS for all bundled shell scripts
- Markdown local-link validation: PASS across 78 Markdown files
- Seeded negative topology catalog: 12/12 classes present

Repository inventory before generated build output:

- 136 files
- approximately 9,914 text lines
- 21 TypeScript source files
- 11 test files
- 8 JSON output schemas
- 78 Markdown documentation/workflow files

Build environment:

```text
Linux x86_64
Node.js v22.16.0
npm 10.9.2
TypeScript 5.8.3
```

## Packaged-artifact verification

The npm release tarball is generated with `npm pack --ignore-scripts`. The release process then extracts that exact tarball into a clean temporary directory and reruns `npm run check` there using the delivery environment's TypeScript 5.8.3 toolchain. This verifies that the published package contains all source, generated runtime output, agents, skills, schemas, tests, scripts, and documentation required by its offline checks.

Archive hashes are delivered separately in `pstack-omp-SHA256SUMS.txt`, avoiding a self-referential checksum inside either archive.

## Runtime verification boundary

The target environment has OMP 18.2.11. An isolated no-session sandbox loaded `src/index.ts` directly and verified `/pstack` renders `Pstack mode: off` with no `pstack:auto` status row. No model-backed provider smoke was required; the registered `pstack_status` behavior is covered by the extension regression and the command-surface smoke.

Run these checks on the target machine:

```bash
npm run verify:omp
PSTACK_LIVE_SMOKE=1 npm run verify:omp
```

The first verifies the OMP version and extension-loading surface. The second performs one short model-backed call against `pstack_status`.

## Important guarantees and non-guarantees

The offline suite verifies state reduction, routing, task rewriting, parent/child session boundaries, structured result ingestion, stale-fingerprint handling, provenance, asynchronous lifecycle reconciliation, child role guards, and completion-gate behavior against a mock OMP extension host.

It does not turn OMP child agents into an operating-system sandbox. In particular, reviewer/verifier Bash commands, browser automation, network access, and external services must still be constrained by the host environment. The plugin provides workflow enforcement and defensive tool guards, not process/container isolation.

Version 0.4.0 implements durable orchestration within a live OMP runtime. It intentionally does not include an always-on daemon that survives host shutdown for multi-day autonomous execution.
