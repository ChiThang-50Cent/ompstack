# Operator: How

Explore the codebase to answer "how does X work?" questions. Produce architectural explanations at the level of a senior engineer onboarding onto a subsystem, enough to build a working mental model, not so much that it reads like annotated source code.

Each exploration uses the OMP `pstack-scout` agent. The scout is read-only and uses the OMP `read`, `grep`, and `glob` tools. Prompt templates live at `skill://pstack/operators/references/how/explorer-prompt.md` and `skill://pstack/operators/references/how/explainer-prompt.md`.

## Step 1. Assess Complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (a single module, a small utility, a narrow question such as "how does function X work"): no explorer child. The parent reads the code and writes the explanation in a single pass. Go to Step 2b.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting feature, a full architectural overview): spawn parallel explorers first, then synthesize their findings in the parent. Go to Step 2a.

When in doubt, take the simple path.

## Step 2a. Explore (complex questions only)

Decompose the question into 2 to 4 exploration angles, each a distinct slice of the subsystem. Spawn all explorers in **one `task` batch**:

- `agent`: `pstack-scout`
- Give each item one angle and the question.
- Do not give explorers write access or ask them to implement anything.

Build each prompt from `skill://pstack/operators/references/how/explorer-prompt.md` with its angle filled in. After the batch returns, continue to Step 3. Unknown or unavailable source categories are reported as gaps, not guessed around.

## Step 2b. Direct Explain (simple questions)

Read the relevant code in the parent session and build the explanation from `skill://pstack/operators/references/how/explainer-prompt.md` without an explorer-findings section. Go to Step 4.

## Step 3. Synthesize (complex questions only)

Reconcile the completed explorer findings in the parent session. Build the explanation from `skill://pstack/operators/references/how/explainer-prompt.md`, filling its explorer-findings section with every result. The parent owns the final explanation; do not spawn a second explainer child.

## Step 4. Present

Present the explanation to the user. Light edits for clarity or context from the conversation are fine. Do not substantially rewrite factual findings.

## Output Format

The explanation uses the sections defined in `skill://pstack/operators/references/how/explainer-prompt.md`, dropping any that do not apply: Overview, Key Concepts, How It Works, Where Things Live, Gotchas.

## OMP contract

The parent owns synthesis and presentation. Child results are evidence, not implementation authority. Keep exact file paths, symbols, line ranges, observed runtime behavior, open questions, and confidence in the explanation. Do not turn an investigation into an implementation without an explicit playbook transition.
