# ompstack for OhMyPi

A small pstack-inspired workflow built around OhMyPi's native skill, task/subagent, custom-agent, and slash-command primitives.

It intentionally does **not** recreate OhMyPi's bundled `task`, `scout`, `reviewer`, or `security-reviewer` agents. The plugin adds:

- `skills/ompstack/` — risk routing, preflight contract, workflow evaluation, and real-surface playbooks
- `skills/ompstack-create-verification/` — creates project-native `verify-<surface>` skills and feature maps
- `skills/ompstack-maintain-verification/` — maintains a verification capability without changing product code
- `skills/ompstack-decision-trail/` — proportional append-only evidence trails for long-running work
- `agents/ompstack-architect.md` — read-only design advisor
- `agents/ompstack-verifier.md` — trusted runtime/behavior verifier instructed not to edit; execution tools are not a write sandbox
- `commands/ompstack.md` and `commands/ompstack-maintain-verification.md` — convenience entry points

## Install

Install the published plugin on another machine:

```sh
omp plugin install ompstack
```

Update an existing installation after a new npm release:

```sh
omp plugin upgrade ompstack
```

## Install unreleased source from GitHub

Use a GitHub source install only when testing an unreleased commit:

```sh
omp plugin install github:ChiThang-50Cent/ompstack
```

## Develop locally

Link the checkout without copying files into an OMP configuration directory:

```sh
omp plugin link .
```

Restart OMP, or run `/reload-plugins` in the active interactive session, before invoking the installed skill or command.

OMP discovery is first-wins when multiple plugins or configuration roots define the same skill, command, or agent name. If an update is not visible, confirm which plugin path won discovery, reload plugins, and spawn a fresh custom agent before diagnosing the new contract.

The same plugin layout is used for local links and direct GitHub installs:

```text
.
├── package.json
├── skills/ompstack/
├── agents/
└── commands/
```

## Invoke

Use the slash command:

```text
/ompstack Fix the intermittent session-expiration regression. Reproduce it first.
```

Or invoke the skill directly:

```text
/skill:ompstack Add idempotent webhook handling and verify duplicate delivery behavior.
```

The skill may also be selected automatically from its description when the task matches.

## Design goal

Keep the pstack ideas that transfer cleanly to OMP:

```text
risk route
   ↓
resolve project verification capability
   ↓
minimal discovery/design
   ↓
conditional native Todo progress state (parent-owned)
   ↓
one owner per write lane
   ↓
fan-in
   ↓
doctor + deterministic gates + real-surface drive
   ↓
independent review / behavior verification
   ↓
fresh affected proof + maintained feature map
```

Native Todo is conditional parent progress state for genuinely multi-phase, fan-in, blocked, explicit-progress, or handoff work. It is neither the task scheduler nor an audit log: Task/Hub owns worker lifecycle, while session artifacts and the decision trail retain durable evidence. The parent checks the native list before mutation and never overwrites a non-empty unrelated Todo list.

Avoid copying Cursor-specific cloud-agent, overnight-loop, PR-auto-merge, and Graphite machinery into a local OMP skill without a native equivalent. Reuse OMP-native project skills, task artifacts, transcripts, and Agent Hub instead.

Project-specific verification belongs at `.omp/skills/verify-<surface>/SKILL.md`. A matching skill names how to launch, Doctor-check, drive, observe, and clean up the real surface; its `features/` directory records user-POV coverage. Create one explicitly with `/skill:ompstack-create-verification`; audit an existing one with `/ompstack-maintain-verification`.

When no matching project capability exists, the verification phase selects the closest proof driver: Browser through Eval for web interaction, live command interaction for CLI/TUI, an existing consumer drive for API/service behavior, DAP debugger observations for live-state mechanisms, and LSP plus an existing behavior pin for symbol refactors. Static checks support these surfaces; they do not replace them.

For autonomous, multi-phase, high-risk, or handoff work, `ompstack-decision-trail` keeps material decisions in `.omp/audit/<task-slug>.tsv` while linking to native `history://`, `agent://`, and artifact evidence.

Prewalk, Advisor, session handoff/export, and Memory are opt-in OMP operator facilities. Ompstack never enables or configures them: Prewalk cannot become a route requirement; Advisor remains inspection-only concern coverage rather than a completion gate; persisted session artifacts remain primary handoff evidence; and any `memory://` context must be cited and revalidated against the current repository. Never share an export or capture a lesson without explicit authorization.

See `docs/DESIGN.md`, `docs/BENCHMARK_EVIDENCE.md`, and `examples/usage.md`.

## Validate

Run the deterministic plugin contract checks before changing routing, custom agents, or playbooks:

```sh
bun run check
```

The check validates primary-route versus overlay/phase/progress-tracking wiring, structured custom-agent capabilities (`tools`, `model`, and `blocking`), preflight rules, self-contained task examples, and complete golden routing coverage. It remains a static contract check; the Eval playbook defines the separate blinded paired behavioral evaluation required for a workflow-policy change.

## Optional unattended evidence adapter

`scripts/run-verification-contract.mjs` executes a versioned verification contract and emits one immutable evidence file per attempt. A v2 contract binds command identity, candidate and protected snapshots, timeout, output cap, oracle result schema, minimum executed tests, and a declared trust level.

`scripts/run-orchestrated-task.mjs` is an optional external controller. It runs an initial worker, evaluates the candidate, permits at most one configured repair worker after a valid `NOT_VERIFIED` result, and appends lifecycle events to a JSONL journal. It accepts completion only from a fresh `VERIFIED` candidate snapshot:

```sh
bun scripts/run-orchestrated-task.mjs --spec /trusted/orchestration.json
bun scripts/run-orchestrated-task.mjs --check /trusted/state/<run-id>/run.json
```

The controller is not an OMP extension and does not turn local execution into a security boundary. It records a caller-declared trust level; only a separately owned executor, oracle, and artifact store can make `isolated` or `ci-attested` meaningful.

Run the behavioral tests for the runner and controller with:

```sh
bun test tests
```

## Attribution

`ompstack` adapts selected pstack workflow concepts to OMP-native primitives. See `NOTICE.md` and `third_party/PSTACK_LICENSE`.
