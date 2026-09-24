# Attribution and scope

This project is an independent OMP implementation inspired by the engineering
ideas published in Cursor's `pstack` plugin. It does not copy the Cursor runtime
or claim compatibility with Cursor-specific tools.

- pstack source: <https://github.com/cursor/plugins/tree/main/pstack>
- Oh My Pi source: <https://github.com/can1357/oh-my-pi>
- Oh My Pi documentation: <https://omp.sh/docs>

The implementation, state model, runtime gates, prompts, schemas, tests, and
documentation in this repository were written for OMP. The project is not an
official Cursor or Oh My Pi product.

## Imported pstack materials

These files import or adapt material from the pinned Cursor `pstack` source. They remain OMP-native and are covered by `scripts/upstream-map.json`.

### Phase 2 principles

- `skills/pstack/principles/attack-the-premise.md`
- `skills/pstack/principles/boundary-discipline.md`
- `skills/pstack/principles/build-the-lever.md`
- `skills/pstack/principles/encode-lessons-in-structure.md`
- `skills/pstack/principles/exhaust-the-design-space.md`
- `skills/pstack/principles/experience-first.md`
- `skills/pstack/principles/fix-root-causes.md`
- `skills/pstack/principles/foundational-thinking.md`
- `skills/pstack/principles/guard-context-window.md`
- `skills/pstack/principles/laziness-protocol.md`
- `skills/pstack/principles/make-operations-idempotent.md`
- `skills/pstack/principles/migrate-callers-then-delete-legacy-apis.md`
- `skills/pstack/principles/minimize-reader-load.md`
- `skills/pstack/principles/model-the-domain.md`
- `skills/pstack/principles/never-block-on-the-human.md`
- `skills/pstack/principles/outcome-oriented-execution.md`
- `skills/pstack/principles/prove-it-works.md`
- `skills/pstack/principles/redesign-from-first-principles.md`
- `skills/pstack/principles/separate-before-serializing-shared-state.md`
- `skills/pstack/principles/sequence-verifiable-units.md`
- `skills/pstack/principles/subtract-before-you-add.md`
- `skills/pstack/principles/test-behavior-not-implementation.md`
- `skills/pstack/principles/type-system-discipline.md`

### T2.2 operator `how`

- `skills/pstack/operators/how.md`
- `skills/pstack/operators/references/how/explorer-prompt.md`
- `skills/pstack/operators/references/how/explainer-prompt.md`

### T2.3 operator `why`

- `docs/mcp-runtime-lifecycle.md`
- `skills/pstack/operators/why.md`
- `skills/pstack/operators/references/why/epistemics.md`
- `skills/pstack/operators/references/why/investigator-prompt.md`
- `skills/pstack/operators/references/why/source-playbook.md`
- `skills/pstack/operators/references/why/synthesizer-prompt.md`
- `skills/pstack/operators/references/why/sources/code-archaeology.md`
- `skills/pstack/operators/references/why/sources/databricks.md`
- `skills/pstack/operators/references/why/sources/datadog.md`
- `skills/pstack/operators/references/why/sources/incident-postmortem.md`
- `skills/pstack/operators/references/why/sources/linear.md`
- `skills/pstack/operators/references/why/sources/notion.md`
- `skills/pstack/operators/references/why/sources/sentry.md`
- `skills/pstack/operators/references/why/sources/slack.md`

### T2.4 panel reviewers and `interrogate`

- `skills/pstack/operators/interrogate.md`
- `skills/pstack/operators/references/interrogate/code-quality-review.md`
- `skills/pstack/operators/references/interrogate/lead-judgment.md`
- `skills/pstack/operators/references/interrogate/reviewer-prompt.md`
- `skills/pstack/operators/references/interrogate/rubric.md`
- `agents/pstack-reviewer-a.md`
- `agents/pstack-reviewer-b.md`
- `agents/pstack-reviewer-c.md`
- `examples/omp-config.example.yml`
