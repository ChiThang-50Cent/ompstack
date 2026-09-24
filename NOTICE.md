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

### T2.5 operators `architect`, `arena`, and `swarm`

- `skills/pstack/operators/architect.md`
- `skills/pstack/operators/references/architect/design-red-flags.md`
- `skills/pstack/operators/references/architect/rationale-template.md`
- `skills/pstack/operators/references/architect/runner-prompt.md`
- `skills/pstack/operators/arena.md`
- `skills/pstack/operators/swarm.md`

### T2.6 skill `pstack-unslop`

- `skills/pstack-unslop/SKILL.md`

### T2.7 main skill merge

- `skills/pstack/SKILL.md`
- `docs/port-notes/poteto-mode-diff.md`

### T3.1 skill `pstack-no-comments` and agent `pstack-comment-sicko`

- `skills/pstack-no-comments/SKILL.md`
- `agents/pstack-comment-sicko.md`

### T3.2 skill `pstack-tdd`

- `skills/pstack-tdd/SKILL.md`

### T3.3 skill `pstack-blast-radius`

- `skills/pstack-blast-radius/SKILL.md`

### T3.4 skill `pstack-technical-writing`

- `skills/pstack-technical-writing/SKILL.md`

### T3.5 skill `pstack-typescript-best-practices`

- `skills/pstack-typescript-best-practices/SKILL.md`
- `skills/pstack-typescript-best-practices/references/patterns.md`

### T3.6 skill `pstack-create-verification` and feature-map examples

- `skills/pstack-create-verification/SKILL.md`
- `skills/pstack-create-verification/references/feature-map-example/README.md`
- `skills/pstack-create-verification/references/feature-map-example/create-note.md`
- `skills/pstack-create-verification/references/feature-map-example/search.md`

### T3.7 skill `pstack-maintain-verification`

- `skills/pstack-maintain-verification/SKILL.md`

### T3.8 skill `pstack-recall` and OMP session docs

- `skills/pstack-recall/SKILL.md`
- `docs/session.md`
- `docs/tools/recall.md`

### T3.9 skill `pstack-reflect` and reviewer prompts

- `skills/pstack-reflect/SKILL.md`
- `skills/pstack-reflect/references/divergent-reviewer.md`
- `skills/pstack-reflect/references/judgment-reviewer.md`
- `skills/pstack-reflect/references/synthesizer.md`
- `skills/pstack-reflect/references/tooling-reviewer.md`
- `docs/tools/reflect.md`

### T3.10 skill `pstack-automate-me`

- `skills/pstack-automate-me/SKILL.md`

### T3.11 skills `pstack-figure-it-out`, `pstack-teach`, `pstack-bro`, and `pstack-show-me-your-work`

- `skills/pstack-figure-it-out/SKILL.md`
- `skills/pstack-teach/SKILL.md`
- `skills/pstack-bro/SKILL.md`
- `skills/pstack-show-me-your-work/SKILL.md`
- `skills/pstack-show-me-your-work/references/decision-log-template.tsv`
- `skills/pstack-show-me-your-work/scripts/log.sh`

### T4.1 playbook `eval` and judge cross-check

- `skills/pstack/playbooks/eval.md`

### T4.2 playbook `hillclimb`

- `skills/pstack/playbooks/hillclimb.md`

### T4.3 playbook `trace-forensics`

- `skills/pstack/playbooks/trace-forensics.md`

### T4.4 playbook `runtime-forensics`

- `skills/pstack/playbooks/runtime-forensics.md`

### T4.5 playbook `authoring-a-skill`

- `skills/pstack/playbooks/authoring-a-skill.md`
