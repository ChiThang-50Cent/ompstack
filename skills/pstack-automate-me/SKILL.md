---
name: pstack-automate-me
description: Draft or revise a personal -mode skill from the user's working conventions, using bounded transcript mining, explicit preference questions, pstack authoring rules, and unslop review.
disable-model-invocation: true
---

# Automate me

Turn the user's recurring working conventions into one concise `<handle>-mode` skill that other OMP agents can follow. This workflow drafts or revises a personal mode skill. It does not replace `skill://pstack`, `skill://pstack-recall`, or `skill://pstack-unslop`; it sequences them.

## 0. Check the existing mode skill

Use `glob` only within the current repository's `.omp/skills/` tree for `<handle>-mode/SKILL.md`. Also inspect the active OMP profile's user-skill directory when the user explicitly asks for a personal, non-repository skill. Do not glob across unrelated project session directories or private conversations.

If a matching mode skill exists, ask whether to update it or start fresh. Updating is the default for a repeat request. If the user already said “update my skill” or equivalent, do not ask that duplicate question.

For an update:

- Mine only transcript history after the last edit of the existing file when that timestamp is available.
- Ask what changed or is missing instead of capturing the user's entire style again.
- Preserve sections the new evidence does not contradict.
- Revise sections supported by new evidence and add sections only for genuinely new rules.
- Never overwrite the existing file unless the user explicitly authorizes the update.

For a new mode, draft at `.omp/skills/<handle>-mode/SKILL.md` in the current project. If the user explicitly chose a personal location, use the active OMP profile's user-skill directory instead. Never silently choose a different project or profile.

## 1. Mine scoped history

Locate the current session with `skill://pstack-recall` rules before fanning out. Use the current-cwd session bucket only. Do not glob across all projects or read unrelated private chats.

Run one OMP `task` batch of bounded `pstack-scout` items over disjoint recent transcript slices, such as three time windows. Give every scout the workspace-scoped session path, its slice bounds, and the same evidence rules. Require a short structured list of patterns with transcript pointers. Do not ask scouts to edit files, write the mode skill, or call parent-state pstack tools.

Look for repeated signals:

- Response preferences: length, tone, format, and corrections such as “make it shorter”.
- Delegation habits: child agents, model roles, special workflows, and parallelism.
- Verification posture: what “done” means, live reproduction, tests, reviewers, and evidence.
- Code and prose discipline: principles, lint or format commands, and style guides.
- Process conventions: worktrees, commits, pull requests, and review or merge tooling.
- Meta preferences: fixing a skill during work and proposing new skills.

Cross-check across slices before codifying a signal. A pattern in two or more slices is high confidence. A lone preference is weak and normally stays out of the draft unless the user explicitly confirms it.

## 2. Ask the user directly

Mining cannot discover intent that never appeared in history. Use the structured `ask` tool for one or two rounds of four to six options. Start broad, for example which areas matter most, then ask specific follow-ups only for selected areas. Allow multiple selections for category questions. After the structured questions, ask one concise free-form question for anything the options missed. Do not dump a questionnaire.

## 3. Cluster and route

Combine the scout findings and confirmed answers into only the sections that have a specific user rule:

- response style
- autonomy and tool use
- understand-first investigation
- delegation and parallelism
- prose or code discipline
- review and verification
- process
- skills and skill-authoring habits

Read `skill://pstack` for granularity. Reference skills by path; do not paste their contents. Keep the mode skill operational and avoid generic advice such as “communicate clearly”. Do not force empty sections or symmetry.

## 4. Draft the mode skill

Draft exactly one `.omp/skills/<handle>-mode/SKILL.md` unless an existing mode skill's category must be preserved. The handle is the user's chosen identifier. Use frontmatter with `name: <handle>-mode`, a single YAML-scalar `description`, and `disable-model-invocation: true` by default. The description must trigger on the handle, `<handle>-mode`, and requests to work in the user's style. Do not trigger generic requests such as “write code” or “review a PR”. Enable automatic invocation only when the user explicitly asks for it.

Keep sections minimal. State concrete defaults, exceptions, evidence requirements, and routing. Use “the user” or “the human” in imperatives rather than embedding the author's name in every sentence. Reference `skill://pstack`, `skill://pstack-recall`, and other existing skills instead of duplicating them.

For a new file, show the complete draft and wait for explicit approval before writing it. For an existing file, show the proposed diff and wait for explicit approval before overwriting it. Never replace an existing file by accident.

## 5. Remove slop and iterate

Run the approved draft through `skill://pstack-unslop`. Remove duplication, vague encouragement, decorative prose, and rules unsupported by repeated evidence. Show the result to the user and accept feedback. A mode skill is not a manual. Keep only behavior that is specific to this user and durable across repositories.

## 6. Land only with approval

After approval, write the draft at the selected `.omp/skills/<handle>-mode/SKILL.md`, preserve any existing category layout, and validate its links and frontmatter. Do not commit, push, or open a pull request unless the user separately requests that work. If the user asks for a repository commit, use the normal pstack verification and evidence workflow.

## Guardrails

- Do not overfit one conversation. A preference stated once and later contradicted is noise.
- Do not invent metaphors or restate other skills. Keep the mode operational.
- Do not encode a narrow task workflow as a personal mode. Use a regular skill when the request is one workflow, such as commit-message style.
- Do not encode a single preference such as one exact command when a durable rule is sufficient.
- Do not turn a skill-authoring request into a runtime automation feature. If a validator, script, or metadata field would enforce the rule, record that as a separate implementation proposal.

## Native OMP note

This is a pstack authoring workflow for `.omp/skills/<handle>-mode/`. It is distinct from any native OMP memory or profile feature that may load user skills automatically. The draft location and explicit approval boundary are deliberate so a personal style cannot silently alter another project.
