# Development

## Repository layout

```text
src/       runtime extension, parent result ingestion, and pure domain modules
agents/    OMP custom-agent definitions
skills/    router skill and lazy workflow corpus
test/      Node test suite and negative fixtures
eval/      comparative router/workflow corpus
examples/  project verification/config templates
scripts/   build validation, install, and OMP smoke helpers
docs/      operator and architecture documentation
```

## Local loop

```bash
npm run clean
npm run build
npm test
npm run validate
npm run check
```

The package avoids network-dependent development tooling in the core test path. `tsc` may be supplied globally or through the declared development dependency.

## Host scenarios

`npm run check` never needs OMP. Host scenarios run the extension inside a real OMP binary against a scripted mock LLM, so they need a globally installed OMP (`bun add -g @oh-my-pi/pi-coding-agent`) but no API key or network:

```bash
npm run test:host                                      # every test/host/scenarios/*.json on the host OMP
npm run test:host -- test/host/scenarios/status-auto.json
PSTACK_HOST_KEEP=1 npm run test:host -- <scenario>     # keep the temp home/workspace/mock log for inspection
PSTACK_OMP_BIN=/path/to/omp npm run test:host          # pick a specific OMP binary
```

`npm run test:host:matrix` runs the same scenarios on every supported OMP version (`PSTACK_OMP_MATRIX`, default `"18.2.11 18.3.0"`). Each version is installed once into the gitignored `.upstream/omp-<version>/` and checked with `omp --version`. The peer range in `package.json` must only claim versions whose matrix column is green.

`scripts/host-smoke.sh` resolves OMP with `scripts/lib/resolve-omp.sh`, which skips `node_modules/.bin`, so the type-checking devDependency is never used as the host. The scenario schema, mock rule steps and assertion types are documented in [test/host/README.md](../test/host/README.md). To add a scenario, drop a JSON file into `test/host/scenarios/`; route child agent sessions with `matchSystem` set to a line unique to the agent body, and give every child assertion a `rule` so it fails when the child never ran.

## Type strategy

`types/oh-my-pi.d.ts` models the API subset used by the plugin so logic can compile offline. It is not published as a replacement for OMP types. Real host compatibility must be checked with `npm run verify:omp` and against OMP's current official type definitions/source.

`npm run verify:omp` sources the same host resolver and prints the selected host OMP plus the local devDependency version when present; the devDependency is never used for runtime smoke. With `PSTACK_LIVE_SMOKE=1`, the default `mock` provider runs `test/host/live-smoke/verify-with-omp.json` offline. Set `PSTACK_SMOKE_PROVIDER=real` for the token-spending provider-backed flow.

`types/node-shim.d.ts` provides the minimal Node declarations needed when `@types/node` is unavailable in an offline environment.

## Adding a playbook

1. Add the literal to `PLAYBOOKS` in `src/domain.ts`.
2. Add router signals in `src/router.ts` where appropriate.
3. Add `skills/pstack/playbooks/<name>.md`.
4. Update `skills/pstack/SKILL.md` routing table.
5. Add positive and negative eval cases.
6. Update asset validation's expected corpus.
7. Run `npm run check`.

A playbook should define phase goal, required outputs, delegation, evidence, skip semantics, and closeout—not generic encouragement.

## Adding an agent

1. Add the role/domain type if new.
2. Create `agents/pstack-<role>.md` with strict tool capabilities and output schema.
3. Map it in `src/model-routing.ts`.
4. Update task rewriting/lifecycle if it writes or verifies.
5. Add asset and integration tests.
6. Decide whether its unfinished lifecycle should block completion.

Never add edit/write tools or `pstack_*` parent-state tools to a child agent. The final verifier must remain read-only and return strict structured output.

## State changes

State version is `PSTACK_STATE_VERSION`. Backward-compatible optional fields can normally remain version 1. A changed interpretation or required field needs:

- version increment;
- migration/restoration logic;
- fixture for previous state;
- explicit changelog note.

Do not silently discard unknown old state and claim a clean run.

## Test philosophy

Prefer failure-oriented invariants:

- background result is not completion;
- a stale digest invalidates PASS;
- writer/verifier collision is rejected;
- missing evidence blocks;
- direct tasks avoid unnecessary orchestration;
- pstack child sessions cannot call parent-state `pstack_*` tools or `hub`; no agent asset declares `task` or `spawns`;
- negative fixtures are validated without being mixed into a golden valid corpus.

## Packaging

```bash
npm run check
npm pack --ignore-scripts
```

Then inspect:

```bash
tar -tzf pstack-omp-*.tgz
```

The `files` whitelist in `package.json` controls the npm tarball. This source distribution intentionally includes tests, validation/install scripts, ambient offline type shims, TypeScript configs, documentation, examples, eval assets, manifests, license, notice, and changelog so the delivered package can be audited and rebuilt without a separate repository checkout.
