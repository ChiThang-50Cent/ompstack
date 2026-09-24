# Operator: Interrogate

Use for "interrogate", "adversarial review", "multi-model review", "challenge this", "stress test this code", "find blind spots", or "tear this apart". Multiple OMP reviewer agents challenge changes from independent contexts and configured model-role candidates.

The deliverable is a synthesized verdict. Do **not** auto-apply changes.

## Step 1. Determine Scope

Identify what to review from context:

- If the user points at specific files or a diff, use that.
- If on a feature branch, inspect the full changeset against the appropriate base branch.
- If the user's message references recent work, gather the relevant files.

Package the diff or file contents plus surrounding context files the reviewers need to understand the code.

## Step 2. State the Intent

Before spawning reviewers, state the intent explicitly. Derive this from the user's message, commit messages, PR description, and code context. Write one clear paragraph. Treat intent as frozen input to the panel; if the execution is wrong, report that rather than changing the goal.

## Step 3. Spawn Reviewers

Launch all configured panel reviewers in **one `task` batch**. Use one item each for `pstack-reviewer-a`, `pstack-reviewer-b`, and `pstack-reviewer-c`, or the subset explicitly requested. Their frontmatter supplies the ordered OMP model-role patterns:

| Agent | Role candidates |
|---|---|
| `pstack-reviewer-a` | `@pstack_panel_a, @pstack_review` |
| `pstack-reviewer-b` | `@pstack_panel_b, @pstack_review` |
| `pstack-reviewer-c` | `@pstack_panel_c, @pstack_review` |

Give every item the same frozen intent, diff/context, rubric, and code-quality lens. Each item has `schemaMode: "strict"`. Do not use model provider slugs, Cursor rule paths, or reviewer personas. Diversity comes from independent reviewer contexts and role candidates, not assigned personalities.

Read the templates at:

- `skill://pstack/operators/references/interrogate/reviewer-prompt.md`
- `skill://pstack/operators/references/interrogate/rubric.md`
- `skill://pstack/operators/references/interrogate/code-quality-review.md`

If all panel role candidates resolve to one model, the final verdict MUST say the panel was single-model. A single-model panel still provides fresh contexts but is not model diversity.

Reviewers are evidence producers, not implementers. They inspect the actual artifact, trace concrete triggers, and return findings with locations, impact, and evidence. They do not edit files, call parent-state pstack tools, or award the final verification verdict. If a reviewer cannot access the artifact, frozen intent, or runtime evidence needed to decide, it returns an inconclusive limitation instead of guessing.

The coordinator must preserve the base and intent sent to every item. Do not let one reviewer receive a partial diff or a different rubric: that would make disagreement measure input differences rather than independent judgment. Drain all items before lead judgment, and retain empty reviews as useful evidence that no issue was found under that context.

## Step 4. Synthesize

As results come back, build a unified picture:

1. Parse all findings from the reviewers.
2. Identify consensus; findings raised independently by two or more reviewers are high signal.
3. Identify lone-reviewer findings; read them carefully but weight them accordingly.
4. Deduplicate by root cause and preserve the locations and evidence.
5. Note disagreements where one reviewer flags an issue and another explicitly rejects it.

## Step 5. Lead Judgment

The parent is the lead reviewer: a pragmatic senior engineer, not a neutral aggregator. Read `skill://pstack/operators/references/interrogate/lead-judgment.md` and categorize every finding:

- **Act on.** Real issues affecting correctness, security, or maintainability given the actual intent. These block a real change.
- **Consider.** Legitimate points whose cost/benefit needs a decision.
- **Noted.** Technically valid but not actionable now.
- **Dismissed.** Wrong, nitpicky, or missing context, with a brief reason.

For each finding include which reviewer(s) raised it, the category, and the rationale. Re-check concrete triggers against the actual code; do not promote a model's self-report into a fact.

## Output Format

### Intent
> [The frozen intent paragraph from Step 2]

### Reviewers
- Reviewer A/B/C: [resolved role/model family if observable], [N findings]

### Act On
[Description, reviewer(s), trigger/evidence, impact, and why it matters.]

### Consider
[Description, reviewer(s), and tradeoff.]

### Noted
[Valid but low-priority items.]

### Dismissed
[Rejected findings with the reason.]

### Agreement Map
[Where reviewers agreed, where they diverged, and what the pattern means. State whether the panel was single-model.]

No reviewer or judge may apply a fix. The parent owns the final decision and any later implementation transition.
