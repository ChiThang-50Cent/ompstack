# ompstack

[pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan, packaged for [Oh My Pi](https://github.com/can1357/oh-my-pi) (OMP).

pstack is a set of Cursor skills for deep-first agent work. This package ships the 33 that OMP lacks, unchanged: `poteto-mode` and its playbooks, `how`, `why`, `architect`, `arena`, `interrogate`, `swarm`, `figure-it-out`, `show-me-your-work`, `no-comments`, `benchmark-checklist`, `technical-writing`, `unslop`, `typescript-best-practices`, and 19 `principle-*` skills. It adds a thin OMP layer:

- `skills/pstack-omp`: the adapter. It maps Cursor tools, subagent fields, model roles, and paths to OMP, and sets the run policy (OMP reply style, local autonomy, explicit approval for remote-ref changes, no remote deploys or data writes).
- `agents/`: one agent per pstack role line, each pinned to an OMP model role, plus pstack's `comment-sicko`.
- `rules/pstack.md`: an always-on rule that points every session at the adapter.

The vendored pstack version is in [`UPSTREAM`](UPSTREAM).

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
  task: <code model>       # poteto-agent, pstack-worker, pstack-panel-b
  slow: <judgment model>   # poteto-judgment, pstack-judge, pstack-panel-a
```

Point `slow` and `task` at different model families so the `arena` and `interrogate` panels get two independent views. The arena cross-judge reads `cfg://modelRoles` to pick the seat whose family differs from its own.

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

## Differences from Cursor

- 22 pstack skills are not shipped. Five duplicate rules OMP's system prompt already enforces (`tdd`, `principle-prove-it-works`, `principle-test-behavior-not-implementation`, `principle-migrate-callers-then-delete-legacy-apis`, `principle-never-block-on-the-human`); `principle-guard-the-context-window` conflicts with OMP's no-budget rule; the rest are standalone commands no poteto-mode playbook uses, or Cursor setup (`setup-pstack`, `poteto-help`). The adapter's "Skills not shipped" table maps each one to its OMP replacement.
- Model choice comes from `modelRoles`, not `pstack-models.mdc`.
- Cursor Automations, Bugbot setup, cloud agents, and `/deslop` are not available. The agent skips those steps with a `Skipped in OMP:` line.
- Local-only experiments are allowed even when a script calls them "deploy". Before each push, merge, or other remote-ref change, the agent shows the exact command and remote/ref scope, asks for explicit approval, and waits. Approval applies only to that command and scope. Deploys to non-local environments and writes/deletes against non-local databases or data services remain forbidden; skipped PR steps end with the exact command for you to run.

## Update

```sh
scripts/sync-pstack.sh [ref]   # vendor pstack from cursor/plugins (default: main)
```

The script copies the skills in its `KEEP` list, `agents/comment-sicko.md`, and pstack's license, rewrites `UPSTREAM`, and prints upstream skills it skipped. A new upstream skill needs a keep or drop decision: add it to `KEEP`, or add a row to the adapter's "Skills not shipped" table. Review the diff against `skills/pstack-omp` before committing: new Cursor names need a row in the adapter.

After a new commit lands on GitHub, run `omp plugin upgrade ompstack`.

## License

MIT for this package ([`LICENSE`](LICENSE)). pstack is MIT, copyright Lauren Tan ([`LICENSE.pstack`](LICENSE.pstack)).
