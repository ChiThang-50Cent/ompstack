# omp-merge-ready

`omp-merge-ready` is an Oh My Pi extension package that carries one engineering intent through evidence-backed discovery, implementation, review, verification, CI, and a deterministic merge-ready gate. It stops at a verified, green branch or pull request; a hosted PR is optional and it never merges.

## Install

From the marketplace (any machine):

```sh
omp plugin marketplace add ChiThang-50Cent/ompstack
omp plugin install omp-merge-ready@ompstack
```

Restart OMP afterwards.

The package can be loaded directly while developing:

```sh
omp -e /path/omp-merge-ready
```

For a persistent installation, add the package root to the global OMP extension setting:

```yaml
# ~/.omp/agent/config.yml
extensions: ["/absolute/path/omp-merge-ready"]
```

Only extension roots supplied through `-e`/`--extension`, the configured `extensions` array, or an installed plugin expose the sibling `skills/` and `agents/` directories alongside the extension module.

This package has no npm dependencies. Use the supplied extension with Bun/OMP and keep the package directory intact so the controller, skill, references, and custom agents are discovered together.

## Model roles

Replicated code review reuses OMP's built-in model roles, so no extra configuration is required: `mr-code-reviewer-a` → `@task`, `mr-code-reviewer-b` → `@slow`, `mr-code-reviewer-c` → `@default`. HIGH rigor needs distinct reviewer models, so point these roles at different models in `modelRoles` if they currently resolve to the same one. Each reviewer receives the same frozen packet and rubric. Other workers use `@task`.

## Usage

Start a run from the repository root with the raw operator intent:

```text
/merge-ready Add project sharing. Existing API behavior must remain compatible.
```

The root session performs repository-grounded specification discovery, records blocking `openQuestions` before asking any clarification, versions a product contract, chooses LOW/MEDIUM/HIGH rigor, and delegates bounded work as appropriate. In forge mode it opens a non-draft PR, calls `mr_refresh` and `mr_review_packet` for the current patch, passes that packet path/digest to independent reviewers, and babysits conflicts/comments/CI. In local mode it does not create a PR: `mr_refresh` proves patch/merge-tree/working-tree state and `mr_run_checks` records local CI. Continue until `mr_gate` passes or a truthful terminal blocker is recorded.

Useful commands:

```text
/merge-ready-status
/merge-ready-abort
```

Controller tools include `mr_state`, `mr_contract`, `mr_receipt`, `mr_gate`, `mr_run_checks`, `mr_transition`, `mr_refresh`, and `mr_review_packet`. Reviewers and verifiers are read-only and receive packet data from the root; they do not mutate controller state or call `mr_*` tools.

## Limitations and safety boundary

- **Headless mode does not work:** observed with v18.4.0: `omp -p "/merge-ready …"` runs the command handler (the run is created in `INTAKE`) and then exits, so the kickoff turn never runs. Use an interactive session.
- **No merge:** the extension has no merge/close/ship operation and blocks `gh pr merge` and equivalent automatic merge commands while a run is active. A separate, explicit shipping workflow is required.
- **Forge is optional:** with no GitHub/forge, local mode can reach `merge_ready` without a PR when the branch has a non-empty patch, a clean working tree, passing controller-produced checks, and clean `git merge-tree` evidence. In forge mode, missing required branch-protection approval is reported as `ready_except_external_approval`, not `merge_ready`.
- **Evidence is patch-bound:** pushes, rebases, semantic fixes, and contract changes can stale receipts and require fresh proof/review. A green check from an old head does not count.
- **The controller is fail-closed:** missing, stale, failed, or inconclusive required evidence blocks completion; repeated blocking without progress eventually becomes `INCONCLUSIVE` rather than a false success.

For local completion, report: `merge-ready branch <name> @ <sha>, merges cleanly into <base>`.

## Package layout

- `extensions/merge-ready/` — controller, state, evidence, gate, forge, and guard implementation.
- `skills/merge-ready/SKILL.md` — concise control-plane methodology.
- `skills/merge-ready/references/` — discovery, clarification, change-shape, design, review, verification, PR, and risk playbooks.
- `agents/mr-*.md` — read-only scouts/reviewers/verifier, architecture and implementation workers, and three replicated code-review lanes.
