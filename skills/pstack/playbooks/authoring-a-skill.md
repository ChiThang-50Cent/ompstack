---
name: pstack-authoring-a-skill
description: Author or modify an OMP skill with a precise trigger, durable instructions, resolved links, and a focused validation loop.
---

# Authoring a skill

Own the skill's voice and its trigger boundary.

1. Read the existing skill, the relevant pstack principles, and neighboring skills before editing. Use `skill://pstack-technical-writing` and `skill://pstack-unslop` for prose discipline. If the request is a personal working-style mode, route to `skill://pstack-automate-me` instead of duplicating that flow.
2. Draft the smallest skill that changes a future decision. Keep frontmatter valid with `name`, `description`, and the intended invocation setting. Trigger descriptions should name the real request shape, not generic “write code” or “review” keywords. Reference other skills by `skill://` path instead of copying them.
3. Validate the skill. Confirm frontmatter, referenced files, local skill links, examples, and any structural metadata. If the skill has a structural contract, add or update a deterministic test. Subjective prose does not need a tautological test.
4. Run `skill://pstack/playbooks/eval.md` against a changed trigger or routing boundary when the skill's behavior is evaluable. Use organic prompts and near-miss prompts. Run the repository validator and focused tests before closing.
5. Review the complete diff, remove duplicated or decorative prose, and record evidence. Never silently weaken a validator to make a skill pass.

When a recurring workflow is not captured anywhere, propose a new skill with a distinct home. Do not turn one narrow task into a general mode. The operator owns approval for writing or overwriting an existing skill.

## Reply

Return the skill summary, trigger boundary, key design decisions, validation commands and outcomes, unresolved links or limitations, and whether the artifact is ready for explicit approval.
