# pstack-omp

`pstack-omp` ports the workflow semantics of Cursor's pstack into the Oh My Pi (OMP) harness. It is not a prompt dump and it is not a replacement coding agent. It is a policy and enforcement layer over OMP's existing skills, custom agents, task worktrees, model roles, extension hooks, and session persistence.

The central contract is simple:

> A model may be wrong with confidence. Keep work bounded, persist state outside the chat, verify the real behavior through an independent context, and bind every final verdict to the exact artifact that was tested.

## What is included

- A sticky `off`, `auto`, or `strict` session mode.
- Thirty task playbooks, twelve reusable operators, and twenty-three engineering principles.
- Twelve custom agents with separated capabilities:
  - inspect-only scout and architect;
  - builder and synthesizer with OMP-owned task isolation;
  - shell-capable reviewer and inspect-only arena judges, including an independent `pstack-judge-b` cross-check;
  - three independent panel reviewers and a read-only comment reviewer using the reviewer contract;
  - blocking, shell-capable final verifier with no edit/write tools (Bash and OMP `eval`; browser/computer are optional Eval preludes, not agent tools);
  - verifier UI checks require OMP `browser.enabled` or `computer.enabled`; absent settings/targets produce `INCONCLUSIVE`, not a claimed browser proof;
- A TypeScript OMP extension that:
  - injects a compact workflow policy;
  - routes role-specific model patterns;
  - requests builder/synthesizer isolation and warns when OMP does not apply it;
  - attaches frozen review and verification contracts;
  - tracks synchronous, concurrent, and background task lifecycles;
  - detects OMP child-agent sessions and keeps parent run state authoritative;
  - blocks parent-state `pstack_*` tools and `hub` inside pstack child sessions (OMP owns all other tool admission);
  - ingests strict child structured output into evidence, acceptance, and verdict records;
  - persists run state in OMP session entries;
  - writes human-readable audit snapshots;
  - fingerprints Git or non-Git workspaces;
  - rejects stale verdicts and writer/verifier collisions;
  - blocks session completion while required gates remain open.
- Project-verification skill guidance and concrete Go API / browser app examples.
- Unit, integration, negative-topology, asset-validation, and router-evaluation fixtures.

### Bundled workflow skills (15 reusable skills)

| Skill | Purpose |
|---|---|
| `pstack-unslop` | Review and remove low-value generated prose before it reaches the artifact. |
| `pstack-no-comments` | Dispatch a read-only comment review and act on accepted findings. |
| `pstack-tdd` | Build a failing-before regression check when the bug has a clear, cheap test path. |
| `pstack-blast-radius` | Prove the safety-critical fact behind a change by running real code. |
| `pstack-technical-writing` | Apply layered structure, reader-focused sentences, and unambiguous technical prose. |
| `pstack-typescript-best-practices` | Apply constructive TypeScript models, boundary validation, and exhaustive narrowing. |
| `pstack-create-verification` | Create a project-local verifier and a validated user-facing feature map. |
| `pstack-maintain-verification` | Audit every mapped feature, update proven drift, and re-run validation after feature changes. |
| `pstack-recall` | Reconstruct current-cwd session context into a compact continuation brief. |
| `pstack-reflect` | Review transcript learnings through a three-agent panel and propose, never apply, skill edits. |
| `pstack-automate-me` | Draft or revise a personal `<handle>-mode` skill from scoped transcript evidence and confirmed preferences. |
| `pstack-figure-it-out` | Design an auditable playbook when no narrower workflow fits, with staged hypotheses, gates, and decision evidence. |
| `pstack-teach` | Explain what a body of work is, how it works, and why it is built that way. |
| `pstack-bro` | Restate the last message in plain human language without jargon. |
| `pstack-show-me-your-work` | Keep the canonical pstack decision trail and an optional reviewer-friendly TSV export. |

## Runtime target

- OMP `>= 18.2.11`.
- Node.js `>= 20` for the repository's offline build/test scripts.
- OMP itself runs the TypeScript extension through its Bun-based extension loader.

OMP 18.2.11 is the minimum because the implementation relies on `before_subagent_spawn` to apply role/model policy and capture provenance before a worker starts.

## Host verification

The host scenarios use the offline mock provider and a real OMP binary:

```bash
# one scenario against the selected host OMP
npm run test:host -- test/host/scenarios/verifier-pass.json

# all scenarios against OMP 18.2.11 and 18.3.0
npm run test:host:matrix
```

Set `PSTACK_HOST_KEEP=1` to retain a failing or passing temporary workspace for audit. The capture report is generated from retained directories with `node test/host/capture-report.mjs <kept-dir> [writers]`. See [docs/verification.md](docs/verification.md) and [docs/port-notes/child-tool-capture.md](docs/port-notes/child-tool-capture.md) for the matrix boundary.

## Install for local development

```bash
unzip pstack-omp.zip
cd pstack-omp
npm install
npm run check
./scripts/install-local.sh
```

Equivalent OMP command:

```bash
omp plugin link /absolute/path/to/pstack-omp
```

Restart OMP after linking so extension modules, agents, and tools are rebuilt. During development, direct loading is also useful:

```bash
omp --extension /absolute/path/to/pstack-omp/src/index.ts
```

See [docs/installation.md](docs/installation.md) for project/user scope, marketplace installation, upgrade, smoke-test, and removal procedures.

## First run

Inside OMP:

```text
/pstack doctor
/pstack auto
```

Then ask for normal engineering work. For an explicit strict run:

```text
/pstack strict
/goal Fix password-reset tokens remaining valid after use
/pstack init bug-fix
```

`/pstack init` binds the run to the active OMP goal; `goal op=complete` is then refused until every gate passes. Without goal mode (for example `omp -p`), enable `auto` or `strict` before `/pstack init bug-fix <objective>`; that opens a gate-only run.

The model should then:

1. load `skill://pstack`;
2. choose and load one playbook;
3. create explicit acceptance criteria;
4. ground the current system before changing it;
5. delegate bounded work to pstack agents where proportional;
6. record reproducible evidence;
7. run an independent verifier when required;
8. finish with `goal op=complete` (refused until gates pass) or, without goal mode, `pstack_gate action=check` / `/pstack check`.

Useful commands:

```text
/pstack                  # current status
/pstack auto|strict|off  # sticky mode
/pstack check            # evaluate gates; closes an auto/strict gate-only run when they pass
/pstack abandon <reason> # mark the run failed
/pstack doctor           # runtime/config/model-role diagnostics
/pstack export           # export state to .omp/pstack/export.json
```

## Modes

### `off`

No policy injection, task rewriting, provenance tracking, or completion blocking. Registered tools remain present, but normal OMP behavior is otherwise untouched.
Gate-only runs require `auto` or `strict` at initialization; `off` refuses to open a run.

### `auto`

The router estimates playbook and ceremony from the task. Tiny local changes can remain direct. Cross-boundary, risky, empirical, or program-scale work escalates.

### `strict`

Pstack agents require an active run. Independent artifact-bound verification is expected for nontrivial implementation, and completion gates are enforced.

## Ceremony levels

| Level | Intended use | Typical topology |
|---|---|---|
| `direct` | obvious, local, reversible edit | coordinator + proportional check |
| `standard` | bounded defect or feature | scout → isolated builder → verify |
| `strict` | cross-boundary, security/data, uncertain root cause | scout/architect → builder → reviewer → independent verifier |
| `program` | multiple workstreams, phases, or PRs | durable brief + queue/ledger + bounded workers |

`program` in version 0.5.0 means orchestration while an OMP session/runtime remains available. It does not claim to be an always-on multi-day daemon; see [docs/limitations.md](docs/limitations.md).

## Completion gates

A required run cannot complete while any of the following is true:

- a required acceptance criterion is open or failed;
- a passed criterion lacks evidence when evidence is required;
- a task worker is still spawned, running, or unresolved;
- final verification is missing;
- the latest final verdict is `FAIL` or `INCONCLUSIVE`;
- the verifier is also listed as a writer;
- a `PASS` lacks evidence;
- the tested fingerprint differs from the current artifact;
- a skipped or waived required step lacks a reason.

The gate is intentionally evidence-oriented. Compilation, a green helper test, CI status, or a builder saying “done” can support a claim, but does not automatically constitute product-surface verification.

## Artifact fingerprints

For a Git workspace, the fingerprint includes:

- `HEAD`;
- tracked changes;
- staged changes;
- untracked file paths and content, subject to configured limits.

For a non-Git workspace, it hashes the bounded file tree. Audit output and common generated/dependency directories are ignored by default. If scanning exceeds configured limits, the fingerprint is marked `partial`; the verifier must expose that limitation rather than treating it as full coverage.

Any post-verification artifact mutation makes the verdict stale.

## Model roles

The agents request role aliases rather than hard-coded providers:

```text
@pstack_fast
@pstack_code
@pstack_reason
@pstack_review
@pstack_verify
@pstack_panel_a
@pstack_panel_b
@pstack_panel_c
```

The ordered agent chains are `@pstack_fast,@smol` (scout), `@pstack_reason,@slow` (architect/judge), `@pstack_code,@task,@smol` (builder/synthesizer), `@pstack_review,@slow` (reviewer), and `@pstack_verify,@slow` (verifier). `@pstack_*` and `@task` depend on configured OMP roles; `@smol`/`@slow` can resolve through the selected/default session model. The writer chains end in `@smol` so a session with only `--model` remains usable. OMP resolves the model; `/pstack doctor` reports each agent's patterns and resolved candidates, while the extension only reorders verifier candidates to prefer a different family when configured. When only one model is available, independence comes from a fresh context, frozen acceptance criteria, restricted tools, and runtime evidence—not from pretending the model is independent from itself.

Panel reviewers use `@pstack_panel_a,@pstack_review`, `@pstack_panel_b,@pstack_review`, and `@pstack_panel_c,@pstack_review`. Configure these OMP roles, not pstack config fields; see [`examples/omp-config.example.yml`](examples/omp-config.example.yml) and [docs/model-routing.md](docs/model-routing.md). If all panel aliases resolve to one model, the interrogate verdict reports a single-model panel.

See [docs/model-routing.md](docs/model-routing.md).

## Configuration

Create `.omp/pstack.json` in the target project. If the file is absent, pstack starts in `off` mode:

```json
{
  "defaultMode": "off",
  "writeAuditFiles": true,
  "enforceIndependentVerifier": true,
  "preferCrossFamilyVerifier": true,
  "requireEvidenceForPass": true,
  "requireArtifactFingerprint": true,
  "auditDirectory": ".omp/pstack/runs",
  "fingerprintIgnore": [
    ".git",
    ".omp/pstack",
    "node_modules",
    "dist",
    "target",
    "vendor"
  ],
  "maxWorkspaceFiles": 20000,
  "maxHashedFileBytes": 26214400,
  "maxPolicyCharacters": 8000,
  "maxStopGateBlocks": 0
}
```

Invalid fields fall back conservatively to defaults and are shown by `/pstack doctor`. Full reference: [docs/configuration.md](docs/configuration.md).

## Project-specific verification

Generic “run tests” logic is not enough for a real application. Create a local skill:

```text
.omp/skills/verify-<project>/SKILL.md
```

It should describe exact startup, readiness, fixture setup, product surfaces, assertions, evidence locations, fingerprint discipline, cleanup, and limitations. Use the bundled `pstack-create-verification` skill or adapt:

- [examples/verify-go-api/SKILL.md](examples/verify-go-api/SKILL.md)
- [examples/verify-web-app/SKILL.md](examples/verify-web-app/SKILL.md)

## Development and checks

```bash
npm run check          # clean, TypeScript build, tests, asset validation
npm test               # build + node:test suite
npm run validate       # manifests, agents, corpus, schemas, docs
npm run verify:omp     # installed-OMP preflight
PSTACK_LIVE_SMOKE=1 npm run verify:omp
npm pack --ignore-scripts
```

The tests cover:

- task classification and proportional ceremony;
- state reduction and completion gates;
- workspace/Git fingerprint behavior;
- model-family routing;
- writer isolation requests and warning behavior;
- end-to-end mock extension flow;
- parent/child extension-instance isolation;
- child-session guards against leaked parent-state `pstack_*` and `hub` calls; OMP owns other tool admission;
- idempotent structured result ingestion;
- stale verifier PASS downgrade to `INCONCLUSIVE`;
- concurrent task correlation by `toolCallId`;
- background-task state remaining pending until OMP reports terminal completion;
- twelve seeded negative topology classes;
- agent/skill/schema/package integrity.

## Architecture

```text
user task
   │
   ▼
pstack router + active run state
   │
   ├── compact policy injected before main-agent turns
   ├── playbook/operator/principle assets loaded lazily
   └── explicit acceptance + durable decision/evidence ledger
          │
          ▼
OMP task/eval substrate
   ├── scout / architect       (read only)
   ├── builder / synthesizer   (isolated writer)
   ├── reviewer / judge        (read only)
   └── verifier                (read only, blocking structured report)
          │
          ▼
parent result ingestion + artifact fingerprint + real-surface evidence
          │
          ▼
completion gates / PASS | FAIL | INCONCLUSIVE
```

Read [docs/architecture.md](docs/architecture.md) for the runtime event sequence, state schema, async lifecycle reconciliation, and trust boundaries.

## Scope and limitations

This is a complete session-level implementation, not a claim that every pstack feature is mechanically identical to Cursor's runtime. Important limitations include:

- OMP re-binds extensions inside child-agent sessions; pstack therefore keeps authoritative state in the parent and ingests child structured output instead of letting workers call parent-state tools.
- OMP's `before_subagent_spawn` event does not expose the parent task `toolCallId`; the extension correlates the spawn to the oldest matching expected agent occurrence, then replaces that provisional relationship with runtime agent IDs from task progress.
- Multi-day execution after the OMP host exits needs an external durable queue/daemon, which is not bundled in 0.5.0.
- OMP agent allowlists are not treated as a sandbox. OMP enforces each agent's `tools` list and pstack blocks only parent-state tools and `hub`, so reviewer/verifier Bash and external product surfaces still require a safe test environment.
- Tool restrictions reduce accidental mutation but cannot prove semantic independence between models trained on correlated data.
- Product verification is only as good as the project-local verification skill and available environment.
- This build was compiled and exercised through an offline mock harness in the delivery environment; run `npm run verify:omp` on the target OMP installation for the final host-level smoke.

See [docs/limitations.md](docs/limitations.md) and [docs/security-model.md](docs/security-model.md).

## Attribution

This repository is an independent OMP implementation inspired by the MIT-licensed Cursor pstack plugin and built against the public OMP extension/agent interfaces. It is not an official Cursor or Oh My Pi product. See [NOTICE.md](NOTICE.md).

## License

MIT.
