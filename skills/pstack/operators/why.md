# Operator: Why

Investigate the motivation and intent behind code.

Companion to the `how` operator. `how` answers what the code does and how it works. `why` answers what forces led to its shape.

## Operating Posture

Operate as a **careful, cautious, and precise investigator**. Be honest about what you know versus what you're inferring. Read `skill://pstack/operators/references/why/epistemics.md` for the confidence framework and phrasing guide. The final synthesis must follow it.

## Step 1. Understand the Target and the Question

Parse what the user is asking. The **target** is usually a chunk of code, a pattern, a feature, or a named design decision. The **question** is usually a design rationale, a tradeoff, a motivating edge case, an external constraint, dead code, or a broad history sweep.

If the target is vague ("why do we do it this way?" with no clear referent), make your best guess from the conversation context. State the interpretation briefly so the user can redirect if it is wrong, then proceed.

## Step 2. Establish the Code Anchor

Before investigating, anchor the question in concrete code. Record:

- the relevant file path(s) and line range(s);
- the key symbols (function names, class names, constants);
- an initial commit list: the last few commits touching the target;
- PR numbers from merge commits (pattern `(#1234)` in the subject line).

Build this inline using the parent session's host capabilities. Read the actual file and use repository history commands where available. Pull substantive PR bodies and discussion through the configured GitHub client. Capture the seed context (file paths, symbols, commits, PR numbers, linked ticket IDs) before delegating.

## Step 3. Build the Coverage Map

**Default to a full parallel investigation.**

### Discovery

Before querying external evidence, list the MCP tools exposed to the current parent session. MCP availability and lifecycle are session-scoped; use `docs/mcp-runtime-lifecycle.md` for the boundary. Map each available tool or server to one evidence category:

1. Source control history
2. Issue / ticket tracker
3. Long-form documents
4. Real-time team chat
5. Infrastructure observability
6. Error / exception tracking
7. Product analytics warehouse

Source control is always available through the repository and the parent host. For the other six, classify using the exposed tool names, server instructions, and resource descriptors. If a tool could fit more than one category, choose the matching primary evidence and record the ambiguity in the coverage map.

Aim for a complete coverage map, not a minimal one. Document the null; don't skip the search.

### OMP investigators

Code and repository-history evidence, plus incident-postmortem evidence stored in the repository, runs in **one `task` batch** of `pstack-scout` items. Each item owns one evidence slice and uses the corresponding prompt and playbook. The scout is read-only and reports facts; it does not edit files.

MCP-backed categories are queried by the **parent** using whatever MCP tools the session exposes. Do not invent a child tool or a result for an unavailable MCP. Record unavailable categories as explicit gaps.

Each scout prompt gets:

1. the base prompt from `skill://pstack/operators/references/why/investigator-prompt.md`;
2. the category playbook from `skill://pstack/operators/references/why/sources/`;
3. the cross-cutting incident playbook when the target looks defensive;
4. the code anchor from Step 2;
5. the user's original question.

### Investigator roster

Spawn one repository scout for the code/history category and one incident scout when the target is defensive. The parent covers each matching MCP category directly:

1. **Source control investigator.** Repository history, PRs, code comments, and tests. Always cover it. It surfaces implementation-time rationale.
2. **Issue / ticket tracker.** The product or business forcing function.
3. **Long-form documents.** Design rationale written before the code.
4. **Real-time team chat.** Deliberation that never reached a document.
5. **Infrastructure observability.** Runtime signals that motivated the code.
6. **Error / exception tracking.** Exceptions and trajectories behind defensive code.
7. **Product analytics warehouse.** Product/data reality behind thresholds, flags, and migrations.

### When to skip an investigator

Only skip with an **explicit written justification** in the final Sources Consulted section. Valid reasons:

- no MCP is available for that category in this session; flag it as a gap, not a choice;
- the source is provably irrelevant, not merely probably irrelevant.

If a single-commit trivial target has a complete answer in its PR, answer inline only after confirming that the other category searches would be redundant, and say so explicitly.

### Coverage ownership

Each investigator owns exactly one evidence category. Do not ask one child to cover multiple MCPs, and do not fan out before the target, code anchor, and coverage map are concrete. The repository scout can inspect the code, comments, tests, and history artifacts assigned to it; the parent owns external MCP queries because those capabilities are not automatically inherited by a child session.

For every category, record what was searched, what was found, and what was unavailable. A category returning no rows is still a result. A category with no exposed MCP is a gap. The final answer must distinguish both from a category that was skipped because it was provably irrelevant.

The source-control category is always covered. Issue, document, chat, observability, error-tracking, and analytics categories are covered when their matching MCP is exposed. If an MCP could fit multiple categories, assign it to the category that matches its primary evidence and record the alternative mapping. This makes the coverage map auditable and prevents a convenient source from being counted as evidence for every question.

### Defensive-code cross-cut

When the target contains null checks, retry logic, timeout handling, rate limits, feature flags, egress guards, or OOM handling, add the incident-postmortem playbook to the repository scout's prompt and to every relevant parent query. Search for incidents across categories rather than treating incident history as a separate source. If the target is not defensive, say why the cross-cutting search was not run.

The output should identify which claims are directly cited, which are supported by converging evidence, which are inferences, and which remain unknown. Do not turn a code shape into a motivation claim without a historical or textual source.

## OMP result handling

Drain the single scout batch completely before synthesis. Preserve each child result with its source category and search scope. Unknown, failed, or empty child results remain visible in Sources Consulted; they are not silently dropped. If a `pstack-synthesizer` is used, pass the complete findings and skipped-source reasons in its task item and verify its citations in the parent before presentation.

## Step 4. Synthesize

Synthesize in the parent by default. When the evidence set is large enough to benefit from an isolated writer, send one `pstack-synthesizer` task item the complete findings, code anchor, original question, epistemics framework, and `skill://pstack/operators/references/why/synthesizer-prompt.md`. The synthesizer is a writer of the answer, not an authority to modify files or state.

The synthesis includes investigator null results and every category skipped with its reason. Spot-check citations against the actual repository or exposed MCP results before presenting.

## Step 5. Present

Present the synthesis to the user. Lightly edit for clarity or conversation context, but do not rewrite its confidence language.

## Output Format

Use the structure in `skill://pstack/operators/references/why/synthesizer-prompt.md`: The Question, The Code in Question, What We Found, What We Can Reasonably Infer, Competing Hypotheses, What We Don't Know, Sources Consulted, and Confidence Summary. Keep the confidence separation intact. Sources Consulted is one line per category, including categories that returned nothing or were skipped.

After Sources Consulted, if the question precedes a code change, convert lineage findings into a Preserve / Change / Avoid / Risk constraint set suitable for planning.

## Common Failure Modes

- **Recency bias.** Assuming the most recent commit is authoritative. Trace earlier decisions.
- **Correlation as causation.** A nearby metric, incident, or release supports a hypothesis but does not prove intent without a direct citation.
- **Confident gaps.** An unavailable MCP is a documented unknown, not permission to guess.

## Reference Files

- `skill://pstack/operators/references/why/epistemics.md`: confidence tiers and phrasing guide.
- `skill://pstack/operators/references/why/investigator-prompt.md`: base prompt for repository scouts and parent MCP investigations.
- `skill://pstack/operators/references/why/source-playbook.md`: category index.
- `skill://pstack/operators/references/why/sources/`: one self-contained playbook per category plus the incident angle.
- `skill://pstack/operators/references/why/synthesizer-prompt.md`: final answer template.
