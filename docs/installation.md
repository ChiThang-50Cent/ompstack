# Installation

## Requirements

- OMP 18.2.11 or newer.
- An OMP provider/model configuration for live agent execution.
- Node.js 20+ and TypeScript only when building/testing this source checkout.

Confirm the host:

```bash
omp --version
omp --help | grep -- --extension
```

## Recommended: local plugin link

From the repository root:

```bash
./scripts/install-local.sh
```

This executes:

```bash
omp plugin link /absolute/path/to/pstack-omp
```

Restart OMP after linking. Extension modules and initialized tool sets are not guaranteed to hot-reload into an already running session.

Inspect installation:

```bash
omp plugin list
```

Then inside a new OMP session:

```text
/pstack doctor
```

## One-off extension development

Load the TypeScript entry directly:

```bash
omp --extension /absolute/path/to/pstack-omp/src/index.ts
```

This validates the runtime extension, but package discovery of bundled agents and skills depends on the plugin/package being discoverable. For full behavior, use `omp plugin link` or a marketplace install.

## Official marketplace

The repository-backed marketplace is published from `ChiThang-50Cent/ompstack`:

```bash
omp plugin marketplace add ChiThang-50Cent/ompstack
omp plugin install pstack-omp@pstack-omp
```

After installation, restart OMP. Use `omp plugin link` or a local marketplace path during development when edits should remain live.

## Build and validate source

The repository intentionally has no runtime npm dependency other than an optional OMP peer declaration. The offline TypeScript build uses local ambient declarations for the API subset exercised by the plugin.

```bash
npm install
npm run check
```

`npm install` is needed only for repository development/checks; the runtime plugin itself has no required npm dependency beyond the OMP host. This performs:

1. clean generated output;
2. strict TypeScript compilation;
3. unit/integration tests;
4. manifest/agent/skill/schema/eval asset validation.

## Host compatibility preflight

```bash
npm run verify:omp
```

The default preflight checks:

- `omp` is on `PATH`;
- version is at least 18.2.11;
- the CLI advertises extension loading.

A model-backed smoke consumes one short OMP request and is therefore opt-in:

```bash
PSTACK_LIVE_SMOKE=1 npm run verify:omp
```

Choose a specific configured role/model if needed:

```bash
PSTACK_SMOKE_MODEL=@slow PSTACK_LIVE_SMOKE=1 npm run verify:omp
```

The smoke loads `src/index.ts`, enables only `pstack_status`, asks the model to call it, and checks that pstack state text is observed.

## Project configuration

Copy the example configuration:

```bash
mkdir -p .omp
cp examples/pstack.example.json .omp/pstack.json
```

Create a product verification skill:

```text
.omp/skills/verify-<project>/SKILL.md
```

Use the `pstack-create-verification` skill from OMP to derive it from the repository rather than copying commands blindly.

## Upgrade

For a linked checkout:

```bash
cd /path/to/pstack-omp
# update source by your normal Git/file workflow
npm run check
```

Restart OMP. Re-run:

```text
/pstack doctor
```

Persisted session state is versioned. Version 0.4.0 writes state version 2 (`pstack-omp/state-v2`); version 1 state from 0.1.0 is not restored. A future incompatible state migration must increment that version and provide explicit restoration logic rather than silently interpreting old state.

## Removal

```bash
./scripts/uninstall-local.sh
```

Equivalent:

```bash
omp plugin uninstall pstack-omp
```

Project audit data remains under `.omp/pstack/` and can be removed separately after confirming it is no longer needed. Session custom entries remain in historical session files; uninstalling the plugin does not rewrite past transcripts.

## Troubleshooting

### `/pstack` is unknown

- Start a new OMP session after linking/installing.
- Run `omp plugin list`.
- Use `omp --extension /path/to/pstack-omp/src/index.ts` to isolate extension-loading issues.
- Check the OMP debug log for extension import failures.

### Agents are not found

- Ensure the package root, not only `src/index.ts`, is installed/linked.
- Confirm the `agents/` files are present in the installed package.
- Run `npm run validate`.

### Model aliases are unresolved

This is not fatal. Agent definitions include fallbacks. Configure the pstack aliases for predictable routing; see `docs/model-routing.md`.

### Completion remains blocked after a background worker finished

Trigger another agent turn or `/pstack check`; the extension reconciles OMP's async-job snapshot before agent starts and session stop. Inspect exported state for `runtimeAgentId`, `jobId`, and lifecycle status. If the host never exposes a terminal job record, pause the run and record the environment limitation rather than forcing PASS.
