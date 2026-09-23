# Contributing

## Development prerequisites

- Node.js 20 or newer.
- TypeScript 5.8 or newer, either from `npm install` or available globally.
- OMP 18.2.11 or newer for host-level smoke tests.

The default build and test path is offline-friendly and does not require a model provider.

## Before opening a change

```bash
npm run check
npm pack --dry-run --json --ignore-scripts
```

For a machine with OMP installed:

```bash
npm run verify:omp
PSTACK_LIVE_SMOKE=1 npm run verify:omp
```

The live smoke consumes a model request and is intentionally opt-in.

## Design rules

1. Keep parent run state authoritative. Child agents return strict structured output; they must not receive `pstack_*` tools.
2. Do not add edit/write tools to scouts, architects, reviewers, judges, or verifiers.
3. A final verdict must bind a completed verifier actor, writer provenance, inspectable evidence, and the exact artifact fingerprint.
4. A task result that is still asynchronous is not completion.
5. Invalid or stale PASS reports fail closed as `INCONCLUSIVE` or leave gates open.
6. Scale ceremony to risk; direct tasks must remain possible.
7. Add failure-oriented tests for every new invariant.

## Adding a playbook, agent, or state field

See `docs/development.md`. Changes to persisted semantics require an explicit state-version decision and migration coverage. Changes to agent output must update the Markdown schema, the corresponding JSON schema, ingestion logic, fixtures, and documentation together.

## Test expectations

A useful regression test demonstrates the unsafe behavior before the fix. Prefer deterministic unit/integration fixtures over tests that depend on a particular model. Live-provider tests belong behind an explicit environment flag.

## Commit and pull-request notes

Document:

- the invariant or workflow behavior changed;
- relevant OMP version/API assumption;
- negative fixture or reproduction;
- commands run;
- any limitation not covered by the offline harness.
