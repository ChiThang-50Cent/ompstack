# Model routing

OMP owns model selection. It resolves `task.agentModelOverrides`, then the agent frontmatter `model:` list, then the session fallback, and passes the result to `before_subagent_spawn` as `patterns`. Pstack does not add, replace, or alias models.

## Role aliases in agent frontmatter

Agent definitions request ordered OMP patterns:

| Agent | Ordered patterns |
|---|---|
| `pstack-scout` | `@pstack_fast, @smol` |
| `pstack-architect` | `@pstack_reason, @slow` |
| `pstack-builder` | `@pstack_code, @task, @smol` |
| `pstack-reviewer` | `@pstack_review, @slow` |
| `pstack-reviewer-a` | `@pstack_panel_a, @pstack_review` |
| `pstack-reviewer-b` | `@pstack_panel_b, @pstack_review` |
| `pstack-reviewer-c` | `@pstack_panel_c, @pstack_review` |
| `pstack-synthesizer` | `@pstack_code, @task, @smol` |
| `pstack-verifier` | `@pstack_verify, @slow` |

`@pstack_*` and `@task` are profile/configuration-dependent role aliases. OMP's `@smol` and `@slow` paths can resolve through the selected/default session model when no explicit role is configured. The writer chains therefore end with `@smol`; a writer chain ending at `@task` fails with `No model selected` when `modelRoles.task` is unset, even if the parent selected a model. `/pstack doctor` reports every agent's ordered patterns and the model each pattern resolves to in the current session.

Configure aliases through the OMP model/role facilities available in your profile. OMP resolves the model; pstack only reorders verifier candidates when its cross-family preference is enabled.

## Pstack's single routing invariant

For `pstack-verifier` spawns only, when `preferCrossFamilyVerifier` is set and the latest builder/synthesizer family is recorded, pstack reorders OMP's `patterns` so candidates from a different family come first. It never adds a pattern that OMP did not offer. Every other spawn keeps OMP's decision; pstack only records the patterns and resolved family in actor provenance.

The extension records the route but does not assert that different providers are statistically independent.

## One-model operation

Pstack still works with one model. Use process separation:

- fresh subagent context;
- frozen objective/criteria;
  - a verifier with no `edit`/`write` tools but explicit host capabilities;
- actual artifact, not writer rationale;
- deterministic evidence and fingerprint gates.

Model diversity can reduce correlated failure; it does not replace runtime observation.

## Cost control

- Keep `auto` mode for normal work.
- Route scouts to fast/small models.
- Use architect/panels only after scope/risk justifies them.
- Run one final verifier, not a panel, unless the verification domain itself is contested.
- Use arena only when there are genuinely competing artifacts or designs.
- Keep worker outputs structured and refer to files instead of copying them into the parent context.

## Suggested profile shapes

### Two-tier

```text
@pstack_fast   → inexpensive model
@pstack_code   → primary coding model
@pstack_reason → strongest model
@pstack_review → strongest model
@pstack_verify → strongest model
```

### Three-family

```text
fast/code      → family A
reason/review  → family B
verify         → family C
```

Do not choose a weaker verifier merely to make the family label different. Capability and access to the real surface remain prerequisites.
