# Code Quality Review

Each reviewer applies this code-quality lens in addition to the rubric. It is a strict standard focused on implementation quality, maintainability, abstraction quality, and codebase health.

Above all, be ambitious about code structure. Do not merely identify local cleanup. Actively search for "code judo" moves: restructurings that preserve behavior while making the implementation dramatically simpler, smaller, more direct, and more elegant.

## Core Prompt

Start from this baseline:

> Perform a deep code quality audit of the current changes.
> Rethink how to structure and implement the changes to meaningfully improve code quality without impacting behavior.
> Work to improve abstractions and modularity, reduce spaghetti code, and improve succinctness and legibility.
> Be ambitious. If there is a clear path to improving the implementation that involves restructuring some of the codebase, identify it.
> Be extremely thorough and rigorous. Measure twice, cut once.

## Dimensions

Each dimension is stated once. Apply the relevant ones.

0. **Be ambitious about structural simplification.** Do not stop at "this could be a bit cleaner." Look for reframings that make whole branches, helpers, modes, conditionals, or layers disappear. Assume a code-judo move may be available. If you can delete complexity rather than rearrange it, push hard for that.

1. **Do not let a change push a file from under 1k lines to over 1k lines without a very strong reason.** Prefer extracting helpers, subcomponents, or modules. Waive only for a compelling structural reason where the resulting file stays clearly organized.

2. **Do not allow spaghetti growth in existing code.** Be suspicious of new ad-hoc conditionals, scattered special cases, or one-off branches inserted into unrelated flows. Prefer a dedicated helper, state machine, or module.

3. **Bias toward cleaning the design, not just accepting working code.** If behavior can stay the same while structure becomes meaningfully cleaner, push for the cleaner version.

4. **Prefer direct, boring, maintainable code over hacky or magical code.** Treat brittle or magic behavior as a problem. Flag thin abstractions, identity wrappers, or pass-through helpers that add indirection without clarity.

5. **Push on type and boundary cleanliness when it affects maintainability.** Question unnecessary optionality, `unknown`, `any`, or cast-heavy code when a clearer type boundary could exist. Prefer explicit typed models over loose objects.

6. **Keep logic in the canonical layer and reuse existing helpers.** Call out feature logic leaking into shared paths or implementation details leaking through APIs. Push code toward the right package, service, or module.

7. **Treat unnecessary sequential orchestration and non-atomic updates as design smells when the cleaner structure is obvious.** If independent work is serialized for no reason, ask whether it should run in parallel. If related updates can leave state half-applied, push for a more atomic structure. Do not over-index on micro-optimizations.

## Output Expectations

Prioritize structural code-quality regressions and missed simplifications first, then spaghetti and branching complexity, then boundary, type, and file-size concerns, then smaller modularity and legibility issues.

## Approval Bar

Do not approve merely because behavior seems correct. Treat these as presumptive blockers unless justified: keeping incidental complexity when a code-judo move would delete it; pushing a file above 1000 lines; adding ad-hoc branching that tangles an existing flow; scattering feature checks across shared code; adding an unnecessary abstraction, wrapper, or cast-heavy contract; duplicating an existing helper; or putting logic in the wrong layer when there is a clear canonical home.

When raising a structural concern, name the code path that becomes harder to change, the duplication or indirection that causes it, and the smallest design move that removes it. Do not promote an aesthetic preference to a blocker without an observable maintenance or correctness consequence. Prefer one high-signal finding with a concrete trigger over a catalog of generic cleanup now.

## Review Tone

Be direct, serious, and demanding about quality. Do not be rude, but do not soften major maintainability issues into mild suggestions. If the code makes the codebase messier, say so. Do not be satisfied with "maybe rename this" when the real issue is structural.
