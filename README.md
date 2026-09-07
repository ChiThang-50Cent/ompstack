# ompstack for OhMyPi

A small pstack-inspired workflow built around OhMyPi's native skill, task/subagent, custom-agent, and slash-command primitives.

It intentionally does **not** recreate OhMyPi's bundled `task`, `scout`, `reviewer`, or `security-reviewer` agents. The plugin adds:

- `skills/ompstack/` — risk routing, preflight contract, workflow evaluation, and measurement-first runtime playbooks
- `agents/ompstack-architect.md` — read-only design advisor
- `agents/ompstack-verifier.md` — trusted runtime/behavior verifier instructed not to edit; execution tools are not a write sandbox
- `commands/ompstack.md` — `/ompstack ...` convenience entry point

## Install from GitHub

This repository is an OhMyPi plugin package. After publishing it to GitHub, install it globally with the documented GitHub plugin source form:

```sh
omp plugin install github:<owner>/<repository>
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
minimal discovery/design
   ↓
one owner per write lane
   ↓
fan-in
   ↓
deterministic gates
   ↓
independent review / behavior verification
   ↓
fix-forward + fresh affected verdict
```

Avoid copying Cursor-specific cloud-agent, overnight-loop, PR-auto-merge, and Graphite machinery into a local OMP skill without a native equivalent.

See `docs/DESIGN.md` for the mapping and `examples/usage.md` for task-batch examples.

## Validate

Run the deterministic plugin contract checks before changing routing, custom agents, or playbooks:

```sh
bun run check
```

The check validates primary-route versus overlay/phase wiring, structured custom-agent capabilities (`tools`, `model`, and `blocking`), preflight rules, self-contained task examples, and complete golden routing coverage. It remains a static contract check; the Eval playbook defines the separate blinded paired behavioral evaluation required for a workflow-policy change.

## Attribution

`ompstack` adapts selected pstack workflow concepts to OMP-native primitives. See `NOTICE.md` and `third_party/PSTACK_LICENSE`.
