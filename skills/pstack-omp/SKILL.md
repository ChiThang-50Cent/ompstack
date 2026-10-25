---
name: pstack-omp
description: Oh My Pi adapter for pstack. Read once per session before following any pstack skill; maps Cursor tools, fields, models, and paths to OMP and sets the user policy.
---

# pstack in Oh My Pi

pstack skills use Cursor names. In Oh My Pi (OMP), read this skill (`skill://pstack-omp`) once per session before you follow any pstack skill, then map each Cursor name in a skill with the tables below. `<pstack>` means the ompstack plugin root, the folder that holds `skills/` and `agents/`: `~/.omp/plugins/node_modules/ompstack` for a GitHub install, or the directory passed to `-e` or listed under `extensions:`. If a Cursor field has no row, drop it and say so. Never pass a field or value the tool schema rejects.

## Policy

The user set these. They override any pstack text that conflicts.

1. **Reply style follows OMP.** Chat replies follow OMP's system prompt, not poteto-mode's "Writing the reply" or pstack's prose-style rules. `unslop` and `technical-writing` apply to artifacts only: docs, PR descriptions, commit messages, plan files, and SKILL.md files. Evidence and verification requirements still govern the work; they do not impose a separate chat style.
2. **Subagents verify as pstack prescribes.** OMP subagents skip builds, tests, and smoke runs unless their assignment says otherwise. So every brief whose worker must build, test, measure, or drive the app says so: `Verification is part of this assignment: run <commands>.` Workers that verify in parallel run with `isolated: true` so they do not race on the shared checkout.
3. **Prescribed fan-out wins.** When a pstack skill or playbook step prescribes spawning subagents, follow it even if the system prompt's Delegation section says inline first, never open with a scout, or never delegate one slice. That wording depends on the active model's delegation bias, and a pstack step counts as the skill asking. Outside prescribed steps, the Delegation section governs.
4. **Local autonomy, remote-ref approval, no remote deploys or data writes.** Inside a pstack run, local work proceeds without asking: file edits, deletes, local commits, branches, worktrees, dependency installs, project scripts, and local databases. This waives the user's AGENTS.md confirmation list for local actions only.
   - **Local experiments are allowed.** Building, installing, starting, restarting, or testing an app, service, or container solely on the local machine is local work, even if its command or script calls it a "deploy". Classify by the actual target and effects, not the command's name. A local command that changes a remote environment is not a local experiment.
   - **Remote-ref changes require explicit user approval.** Before each `git push` (including force pushes and remote branch/tag deletion), or any other action that moves a remote ref (`gh pr merge`, `gh pr create` with push, merge-queue arming), show the exact command, remote/repository, and affected refs; request approval and wait. Use the runtime approval prompt when available; otherwise ask in chat. Silence, a general task request, or a previous command's approval is not approval. Execute only the approved command and scope; ask again if either changes. Subagents must obey the same gate and cannot bypass it.
   - **Remote deploys and data writes remain forbidden.** Never run, or ask a subagent to run, a command that publishes or rolls out an app/service to a non-local environment (including staging, preview, and production), or writes/deletes against a non-local database or data service.
   For a forbidden step, skip it with the line from Cursor-only features and hand the human the exact command. For a remote-ref step awaiting approval, block its todo and wait; do not skip it or mark it done. If approval is declined, drop the step and state why. The configured `bash.patterns` prompts remain a backstop; they do not override these restrictions. pstack's own "Always pause" list still applies.
5. **OMP's system prompt wins a direct conflict.** Where a pstack rule and an OMP system-prompt rule prescribe different actions for the same situation, follow OMP. Examples: never set or narrate turn or token budgets; reuse the codebase's existing patterns instead of adding a second convention; remove throwaway scripts at cleanup, while tooling with lasting value stays.

## Brainstorm routing

Before selecting a poteto-mode playbook, classify the user's intent:

- For explicit brainstorming or collaborative exploration of an unsettled idea, follow `skill://brainstorm`. The skill also works without poteto-mode.
- For an evidence-based question such as "should we do X?", use Investigation unless the user wants to develop an idea together.
- For a clear implementation request, use the matching playbook. Do not add a brainstorm phase.
- If an implementation request lacks one product decision, ask about that decision. Do not turn every clarification into a brainstorm session.

Brainstorm is a local, no-code workflow. Its readiness gate authorizes reviewers, not implementation. Accepting its brief does not authorize `architect`, executable sketches, or code changes. Only an explicit request to enter a separate design or implementation phase permits that handoff. If the original request includes implementation, confirm the transition before leaving brainstorm. For design without implementation, invoke `architect` with its checkpoint enabled.

Keep routing here and the workflow in `skill://brainstorm`. Do not duplicate the workflow in vendored poteto-mode files.

## Tools

| Cursor | OMP |
| --- | --- |
| `Task` | `task` with a `tasks[]` batch. Inside `eval`, `agent()` or `workpool()` also work. |
| `AskQuestion` | `ask`. Under `omp -p` it is absent, so ask in plain text. |
| Open a todolist | `todo` `init`, with one phase named for the playbook whose items are its steps, copied verbatim. A step you choose not to do gets `drop`, and your reply names the reason. Send every `todo` call alongside a real tool call, never alone. |
| Run another pstack skill (`/name` or "the **name** skill") | `read` `skill://<name>` and follow it. Bundled files resolve under it, such as `skill://poteto-mode/playbooks/feature.md`. When you tell the user to type it, write `/skill:<name>`. |
| `Grep`, `Glob`, `Read` | `grep`, `glob`, `read`. |
| Cursor's `/loop` | Only the human can arm OMP's `/loop`. Write the exit predicate as a shell command, then give the human `/loop --until '<command>'`. For an agent-side wake, run the watcher (`gh pr checks --watch`, a poll script) through `bash` with `timeout: 0` and act on its delivered result. |
| Cursor's built-in `create-skill` | Follow `skill://poteto-mode/playbooks/authoring-a-skill.md` alone. An OMP skill is `<dir>/<name>/SKILL.md` with `name` and `description` frontmatter. |
| `deslop` from `cursor-team-kit` | Not installed. Skip with the line. |
| `control-ui` | The `browser` helper in `eval`. |
| `control-cli` | `bash` with `pty: true`, or tmux. |
| A built-in PR tool | `gh pr create` without pushing can use an already-pushed branch. Any required push must first pass Policy 4's explicit approval gate. |

## Subagent fields

| Cursor | OMP |
| --- | --- |
| `subagent_type: "poteto-agent"` | `poteto-agent` for code, `poteto-judgment` for prose, judgment, or the hardest changes, per Models. |
| `subagent_type: generalPurpose` | The agent that the skill's role line maps to, per Models. |
| `subagent_type: "comment-sicko"` | `comment-sicko`. |
| `readonly: true` | Keep the role's agent. The brief says `Read-only: do not edit files.`, and you check `git status` afterward. |
| `readonly: false` | Omit. OMP subagents keep the session's MCP tools. |
| `environment: "cloud"` | `isolated: true` on the task item. The worker runs in its own worktree, and its changes come back as a patch or branch for you to integrate, never auto-applied. |
| `environment: "local"` | Omit. |
| `cloud_base_branch: <b>` | Tell the worker to check out `<b>` first. |
| `run_in_background: true` | Omit. Tasks run in the background and their results deliver automatically. |
| `resume` | `write agent://<id>` while that agent is still alive. Otherwise spawn a fresh agent and put `agent://<id>` in its brief. |
| `file_attachments` | List the paths in the brief, or write bulk to `local://<name>.md` and pass that. |
| `model` | Omit for ordinary pstack workers. OMP picks their model from the agent name. Only the historical `seance` agent accepts a task-level model override. See Models. |
| Reasoning level and fast or standard speed | Omit. The role's model value carries its effort, such as `:high`. |

## Models

pstack role lines map onto OMP's built-in model roles. Code roles, whose pstack default is a fast code model, use `@task`. Judgment roles, whose pstack default is the strongest judgment model, use `@slow`. The user assigns models to those roles under `modelRoles` in `~/.omp/agent/config.yml`. The `pstack-models.mdc` rule and the `setup-pstack` skill do not exist here. Never run `setup-pstack`, and never read or write `pstack-models.mdc`. Where a skill says to use a role line's value or its default slug, spawn that line's agent.

| pstack role line | OMP agent | Model role |
| --- | --- | --- |
| `feature, refactoring`, `bug-fix`, `perf-issue`, `hillclimb` | `poteto-agent` | `@task` |
| `judgment and prose`, `hardest tasks` | `poteto-judgment` | `@slow` |
| `how explorer`, `why investigators`, `reflect tooling`, `swarm workers` | `pstack-worker` | `@task` |
| Verification spawns (poteto-mode: "Verification ... stays on the `swarm workers` model") | `pstack-worker`, never the default `task` agent | `@task` |
| `how explainer`, `why synthesizer`, `reflect judgment, divergent, synthesizer` | `pstack-judge` | `@slow` |
| `arena runners`, `architect runners`, `interrogate reviewers` | `pstack-panel-a`, `pstack-panel-b` | `@slow`, `@task` |
| `arena cross-judge pool` | `pstack-panel-a` or `pstack-panel-b` | Same |

Panels spawn one seat per panel agent, so Reviewer A is `pstack-panel-a` and Reviewer B is `pstack-panel-b`. Panel diversity holds only while `slow` and `task` point at different model families. For the arena cross-judge, read `cfg://modelRoles` (read-only; this line is the user's standing request to read it, never write it). Your own model is the one you run on: inside a pstack agent, your agent's role (`@task` or `@slow`); in the main session, the model the session started with, which is the `default` entry unless the user picked another. Pick the panel agent whose role maps to a different model family from yours. A family is the model line (`gpt`, `claude`, `gemini`, `grok`, ...), not the provider prefix. If both panel roles differ from yours, or both match, use `pstack-panel-b`. Family fallbacks in the skills (`claude-*`, `grok-*`, `composer-*`) do not apply. When a spawn fails on model resolution, report it and run that seat on the parent model with `task`.

## Paths

| Cursor | OMP |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `.omp/skills/`, `~/.omp/agent/skills/`. A generated `verify-<app>` skill goes in the project's `.omp/skills/`. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `<pstack>`. OMP loads it as an extension package: skills from `<pstack>/skills/`, agents from `<pstack>/agents/`, and the always-on rule from `<pstack>/rules/`. |
| `.cursor/rules/*.mdc`, always-applied rules | Project `AGENTS.md`, or `.omp/RULES.md` for a rule that must hold every turn. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | `<pstack>/<path>` when that file exists. Read the local copy and never fetch it. Give the user the URL when they need a link. |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `~/.omp/agent/sessions/<slug>/<timestamp>_<id>.jsonl`. The slug is the workspace path relative to `$HOME` with each `/` changed to `-`, so `~/code/proj` is `-code-proj`. The same-named folder beside a transcript holds its artifacts and subagent transcripts. Identify the requested session by its ID and contents; the newest file is not necessarily the current session when several sessions run concurrently. Read only this workspace's folder. `history://<id>` reads a subagent transcript, and the `seance` agent with `sourceSession` answers questions about a past session. |
| `node pstack/skills/poteto-mode/scripts/...` | `<pstack>/skills/poteto-mode/scripts/...`. Run TypeScript entry points with `bun`. |

## Cursor-only features

OMP has no Cursor Automations, Bugbot, or Cursor cloud agents. When a step needs one, or Policy 4 forbids it, put one line in your reply, `Skipped in OMP: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry for these forbidden or unavailable steps. This does not apply to remote-ref changes: request approval and wait per Policy 4. When a later step needs what the skipped step made, such as a URL or a key, leave a placeholder and name it in the line. A PR step that cannot be completed gets todo `drop`, never `done`, and the exact command for the human.

| Cursor | OMP |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | Skip with the line. This covers `make-bot-ui` and `automations/benny`. |
| Bugbot | Bugbot comments on a GitHub PR are ordinary review threads, so triage them with the forge command the step gives. Skip a step that starts, waits for, or configures Bugbot when the PR has no Bugbot check or comment. |
| Cursor cloud agents | `environment: "cloud"` maps to `isolated: true`, as in Subagent fields. Skip a step that needs the cloud agent itself, such as its dashboard status or its own machine. |
| Pushing, merging, or arming a merge queue | Show the exact command and remote/ref scope, request explicit user approval, and wait before executing, per Policy 4. |

## Skills not shipped

This port ships only the pstack skills OMP lacks. When a pstack file names one of the skills below, do what the right column says instead of reading it. A principle replaced by an OMP rule counts as read for poteto-mode's citation rule; cite the OMP rule.

| pstack skill | Use instead |
| --- | --- |
| `tdd` | OMP's Verify section: a failing-before, passing-after regression test when the bug has a cheap local test path, otherwise a smoke run. The playbook's commit order still holds: the failing test lands before the fix. |
| `principle-prove-it-works` | OMP's Verify section: run the changed path on the real surface and observe the result before yielding. |
| `principle-test-behavior-not-implementation` | OMP's Verify section rules for permanent tests: consumer-visible behavior only, never wiring, mocks, or source text. |
| `principle-migrate-callers-then-delete-legacy-apis` | OMP's clean-cutover contract: migrate every caller, then remove the old path, with no shims or aliases. |
| `principle-never-block-on-the-human` | OMP's rule to default to informed action on reversible work, bounded by Policy 4. |
| `principle-guard-the-context-window` | OMP's delegation and read-range rules: route bulk work to subagents, read ranges, pass large payloads as `local://` files. Never set turn budgets (Policy 5). |
| `ketchup`, `bro` | A plain OMP-style reply: what changed, the evidence, and every item waiting on the human. |
| `reflect` | Not shipped. Ignore it in role lists. |
| `blast-radius`, `recall`, `correct`, `sharpen`, `teach`, `statechart`, `automate-me`, `in-your-own-words`, `poteto-help`, `create-verification-skill`, `maintain-verification-skill`, `create-formal-verification-skill`, `maintain-formal-verification-skill`, `setup-pstack`, `make-bot-ui` | Not shipped; no poteto-mode playbook depends on them. If the user asks for one by name, say it is not part of this port. |
