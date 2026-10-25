# ompstack

[pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan, packaged for [Oh My Pi](https://github.com/can1357/oh-my-pi) (OMP).

pstack is a set of Cursor skills for deep-first agent work. This package ships the 33 that OMP lacks, unchanged: `poteto-mode` and its playbooks, `how`, `why`, `architect`, `arena`, `interrogate`, `swarm`, `figure-it-out`, `show-me-your-work`, `no-comments`, `benchmark-checklist`, `technical-writing`, `unslop`, `typescript-best-practices`, and 19 `principle-*` skills. It adds a thin OMP layer:

- `skills/pstack-omp`: the adapter. It maps Cursor tools, subagent fields, model roles, and paths to OMP, and sets the run policy (OMP reply style, local autonomy, explicit approval for remote-ref changes, no remote deploys or data writes).
- `skills/brainstorm`: a local no-code ideation workflow inspired by Google's [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model). Two read-only reviewers challenge a concept before technical design.
- `agents/`: pstack role profiles, two local brainstorm reviewers, and pstack's `comment-sicko`. Model selection uses OMP roles.
- `rules/pstack.md`: an always-on rule that points every session at the adapter.

[`UPSTREAM`](UPSTREAM) records the imported pstack baseline and selective ports. It does not claim that local skills or the whole package match one upstream revision.

## Install

```sh
omp plugin install github:ChiThang-50Cent/ompstack
```

Git installs are user-scoped: every project sees the skills, agents, and rule. To load the package for one project only, clone it and list the clone in that project's `.omp/config.yml`:

```yaml
extensions: ["/path/to/ompstack"]
```

For a single session, use `omp -e /path/to/ompstack`.

## Configure

pstack's agents use OMP's built-in model roles. Set them in `~/.omp/agent/config.yml`:

```yaml
modelRoles:
  task: <code model>       # poteto-agent, pstack-worker, pstack-panel-b, brainstorm-b
  slow: <judgment model>   # poteto-judgment, pstack-judge, pstack-panel-a, brainstorm-a
```

Point `slow` and `task` at different model families so the `arena`, `interrogate`, and brainstorm reviewers get independent model perspectives. The arena cross-judge reads `cfg://modelRoles` to pick the seat whose family differs from its own.

pstack runs parallel workers in their own worktrees. Enable OMP task isolation, and keep `apply: false` so worker changes come back for review instead of landing on your checkout:

```yaml
task:
  isolation:
    enabled: true
    apply: false
```

## Use

Start a run with `/skill:poteto-mode <what you want>`. Other entry points: `/skill:how`, `/skill:why`, `/skill:architect`, `/skill:arena`, `/skill:interrogate`.

pstack skills are hidden from the model's skill list (`disable-model-invocation`), so they run only when invoked or when another pstack skill calls them.

### Explore an idea before implementation

Run `/skill:brainstorm <idea>` directly, or ask poteto-mode to brainstorm an unsettled idea. The adapter routes ideation to the same skill. Clear implementation requests and evidence-based investigations do not need this phase.

Brainstorm asks open questions about unresolved goals and constraints. After you approve the working hypothesis for review, two fresh read-only agents challenge it. The main session records the brief in a separate artifact for each concept, resolves objections with you, and stops.

Approving review or accepting the brief does not authorize code. Request a separate design or implementation phase to continue. For design only, the handoff uses `architect` with its checkpoint enabled.

Reviewer profiles allow only `read`, `grep`, and `glob`. They receive the brief and a scoped reading list, not the parent conversation or another reviewer's findings. Project and system policies still apply. Different model roles do not guarantee different model families.

This is an OMP-native workflow inspired by EGM, not a port of EGM's skills or its full draft and review pipeline. The methodology was reviewed at EGM revision `3d0b34821ce88ad328b0c9bf0e06d7eb5f1cd669`.

## Differences from Cursor

- 22 pstack skills are not shipped. Five duplicate rules OMP's system prompt already enforces (`tdd`, `principle-prove-it-works`, `principle-test-behavior-not-implementation`, `principle-migrate-callers-then-delete-legacy-apis`, `principle-never-block-on-the-human`); `principle-guard-the-context-window` conflicts with OMP's no-budget rule; the rest are standalone commands no poteto-mode playbook uses, or Cursor setup (`setup-pstack`, `poteto-help`). The adapter's "Skills not shipped" table maps each one to its OMP replacement.
- Model choice comes from `modelRoles`, not `pstack-models.mdc`.
- Cursor Automations, Bugbot setup, cloud agents, and `/deslop` are not available. The agent skips those steps with a `Skipped in OMP:` line.
- Local-only experiments are allowed even when a script calls them "deploy". Before each push, merge, or other remote-ref change, the agent shows the exact command and remote/ref scope, asks for explicit approval, and waits. Approval applies only to that command and scope. Deploys to non-local environments and writes/deletes against non-local databases or data services remain forbidden; skipped PR steps end with the exact command for you to run.

## Update

Review changes in [`cursor/plugins/pstack`](https://github.com/cursor/plugins/tree/main/pstack) against the baseline in `UPSTREAM`. Port only the changes this package needs. Do not replace the entire `skills/` tree.

For each update:

1. Review upstream skill, playbook, agent, and license changes.
2. Choose which changes to port. Record omitted skills in the adapter's "Skills not shipped" table.
3. Preserve local `brainstorm`, `pstack-omp`, reviewer profiles, and rules. Map new Cursor tools or roles in the adapter.
4. Record the source revision and affected paths in `UPSTREAM`. Keep the imported baseline when applying a selective port.
5. Review the resulting diff and verify affected workflows in a fresh `omp -e .` session before committing.

Retain `LICENSE.pstack` and any attribution required by the material you port.

After a new commit lands on GitHub, run `omp plugin upgrade ompstack`.

## License

MIT for this package ([`LICENSE`](LICENSE)). pstack is MIT, copyright Lauren Tan ([`LICENSE.pstack`](LICENSE.pstack)).
