# Epistemics

How to reason about confidence when evidence is historical, fragmentary, and sometimes contradictory, and how to communicate it without flattening it into false certainty.

Code doesn't carry its own motivation. You can read what code does. You can't read *why it exists*. That lives in commits, PRs, tickets, docs, and conversations, all incomplete, biased, and sometimes missing entirely. Pretending otherwise produces confident-sounding guesses that mislead the user.

## Confidence Tiers

Every claim in the final output must sit in one of these tiers. The tier determines which output section the claim goes in and how it's phrased.

### 1. Direct

An explicit, textual citation that answers the question. Not "the code does X so the author must have wanted X." Something an author actually *wrote* that says why.

Examples:
- A PR description that says "this fixes the bug where users with >1000 items couldn't paginate"
- A ticket that says "we're adding this because customer Acme requested it in their security review"
- A code comment that says "// clamp to 100 because the upstream API rejects larger values"
- A design doc that says "we chose option A over option B because we need persistence across restarts"
- A chat message from the author saying "switching to this approach since the old one was flaky in tests"

Phrasing: confident, present tense. "This exists because X." Cite the source.

### 2. Supported

Multiple pieces of indirect evidence converge. No single source states it explicitly, but the pattern across sources makes it likely.

Examples:
- The PR title says "improve performance," the ticket is labeled "perf," and the surrounding commits all touch the same hot path
- Multiple tests were added alongside the change, all exercising edge cases with very large inputs
- The author's other PRs from the same week all mention the same incident in their descriptions

Phrasing: confident but clearly derived. "The evidence points strongly to X: [the specific pieces]." Cite multiple sources.

### 3. Inferred

A reasonable reading of the context, but nothing explicitly supports it. The reader should understand this is *your interpretation*, not a fact from the record.

Examples:
- The PR doesn't say why, but given the error was happening in production (per the incident channel timing) and the fix was rushed (merged the same day), it was likely a hotfix.
- The function name suggests retry logic. The retry count is 3. This matches the team's general convention of "3 retries" seen elsewhere in the codebase.

Phrasing: hedged. "It appears", "likely", "suggests", "is consistent with", "one reading is". Make the inference chain explicit: "Given A and B, C seems likely because D."

### 4. Speculative

A plausible hypothesis, but the evidence is thin and other explanations fit equally well. Presenting these is valuable, but mark them clearly as guesses.

Examples:
- "This might be a workaround for a browser bug that's since been fixed, but we found no contemporary evidence of that."
- "It's possible this threshold was chosen to match an SLA commitment, but no SLA doc references it."

Phrasing: explicitly speculative. "One possibility is X, but we have no direct evidence." Usually lives in the "Competing Hypotheses" section alongside other possibilities.

### 5. Unknown

You looked and couldn't find out. A valid and important outcome. Document it.

Phrasing: "We searched X, Y, and Z and found no evidence of why." Be specific about *what* you searched. "We couldn't find out" is less useful than "we searched the ticket tracker with keywords A and B, scanned the 6 PRs that touched this file since 2023, and searched the repository for string literals matching the threshold. None surfaced a rationale."

## Phrasing Guide

### Words that carry confidence. Use carefully

These imply **Direct** or **Supported** confidence. Don't use them for inferences.

- "because". Implies a causal claim with evidence
- "the reason is". Same
- "was designed to". Claims author intent
- "fixes", "addresses", "solves". Claims the change achieved its goal
- "the team decided". Claims a group decision happened

If you're using these, you should have a citation immediately adjacent.

### Words that hedge. Use for inferences

- "appears to"
- "seems to"
- "likely"
- "suggests"
- "is consistent with"
- "one reading is"
- "plausibly"
- "may have been"
- "the evidence points toward"

These signal that you're interpreting, not reporting. Use them liberally in the "What We Can Reasonably Infer" section.

### Words to avoid

- "obviously". If it were obvious, the user wouldn't be asking
- "clearly". Almost always precedes a claim that isn't clear
- "of course". Same
- "just" (as in "it's just X for performance"). Dismissive and usually hides complexity
- "I think" / "I believe". Use "the evidence suggests" instead

## Avoid rationalization

Code that "makes sense" today may have been written for reasons that no longer apply, or that were wrong when they were written. Don't retrofit a clean rationale onto messy history.

Resist the urge to:
- Assume the author did the "right" thing and work backward to justify it
- Assume a consistent pattern across the codebase was intentional when it might be copy-paste
- Turn an absence of evidence into evidence of absence ("no one mentioned security concerns, so it must not have been a concern")

## The Sycophancy Trap

Users often phrase `why` questions with an embedded hypothesis: "Why do we do it this way, I assume it's for performance?" Don't simply confirm it. Treat it as one candidate among others and check the evidence independently.

The user's guess is a prompt for investigation, not a conclusion to validate.

## When Evidence Contradicts

If two sources disagree, surface both. Don't pick the one that fits a tidier narrative. The ticket may describe the motivation while the PR frames the work as cleanup; both may be true, or one may be wrong.

## When Evidence Is Missing

An honest "we don't know" is one of the most valuable outputs this operator can produce. Name the gap concretely:
- what question you were trying to answer;
- what sources you searched;
- what you searched for in each;
- what you found (nothing, or only tangentially related material).

## Calibration Check Before Finalizing

Before delivering, review every claim in "What We Found" and "What We Can Reasonably Infer":

1. Does the claim have a citation? If not, add one or move it to Inferred / Hypotheses.
2. Is the phrasing calibrated to the tier?
3. Am I treating the code itself as evidence for its own intent? If so, reclassify or remove it.
4. Does the output include "What We Don't Know"? If no gaps are mentioned, check again.
