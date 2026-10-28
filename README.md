# ompstack

[pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan, packaged for [Oh My Pi](https://github.com/can1357/oh-my-pi) (OMP).

pstack is a set of Cursor skills for deep-first agent work. This package ships the 33 that OMP lacks, unchanged: `poteto-mode` and its playbooks, `how`, `why`, `architect`, `arena`, `interrogate`, `swarm`, `figure-it-out`, `show-me-your-work`, `no-comments`, `benchmark-checklist`, `technical-writing`, `unslop`, `typescript-best-practices`, and 19 `principle-*` skills. It adds a thin OMP layer:

- `skills/pstack-omp`: the adapter. It maps Cursor tools, subagent fields, model roles, and paths to OMP, and sets the run policy (OMP reply style, local autonomy, explicit approval for remote-ref changes, no remote deploys or data writes).
- `skills/advisor`: a cross-model consultation before substantial implementation, adapted from Cursor's Advisor workflow.
- `agents/`: pstack role profiles, advisor profiles, and pstack's `comment-sicko`. Model selection uses OMP roles.
- `rules/pstack.md`: an always-on rule that points every session at the adapter.

[`UPSTREAM`](UPSTREAM) records the imported pstack baseline and selective ports. It does not claim that local skills or the whole package match one upstream revision.

See [`CHANGELOG.md`](CHANGELOG.md) for plugin release changes.

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
  task: <code model>       # poteto-agent, pstack-worker, pstack-panel-b, advisor-task
  slow: <judgment model>   # poteto-judgment, pstack-judge, pstack-panel-a, advisor-slow
  advisor: <advisor model> # advisor-role
```

Point `slow` and `task` at different model families so the `arena` and `interrogate` panels get independent model perspectives. The arena cross-judge reads `cfg://modelRoles` to pick the seat whose family differs from its own.

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

For a substantial implementation, `advisor` consults a read-only agent from a different model family before changes. Configure `advisor` above to a different family from the active session model. The skill prefers that role, then checks `slow` and `task`. You can also invoke `/skill:advisor` for an explicit consultation. If the actual model identities cannot be verified, the workflow reports that the consultation is unverified.

Follow-up questions reuse the same agent when available and send only new evidence. Provider prompt-cache reuse is not guaranteed.

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
3. Preserve local `pstack-omp`, agent profiles, and rules. Map new Cursor tools or roles in the adapter.
4. Record the source revision and affected paths in `UPSTREAM`. Keep the imported baseline when applying a selective port.
5. Review the resulting diff and verify affected workflows in a fresh `omp -e .` session before committing.

Retain `LICENSE.pstack` and any attribution required by the material you port.

After a new commit lands on GitHub, run `omp plugin upgrade ompstack`.

## License

MIT for this package ([`LICENSE`](LICENSE)). pstack is MIT, copyright Lauren Tan ([`LICENSE.pstack`](LICENSE.pstack)). Cursor Advisor is MIT, copyright Cursor ([`LICENSE.advisor`](LICENSE.advisor)).
