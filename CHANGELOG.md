# Changelog

## Unreleased

### Fixed

- Strict's pre-run write block no longer stops OMP device calls (`write xd://…`), sandbox drafts (`local://…`, any `scheme://`), hashline-wrapped sandbox paths, or writes outside the workspace; unknown input shapes stay blocked.
- The tripwire counts edits to assume-unchanged and skip-worktree files.
- The tripwire baseline is retaken on the first active turn when pstack was off at session start, or when no baseline exists.

### Added

- Engagement tripwire (`engagementTripwire`, `directMaxFiles`, `directMaxLines`). A session that changes more than the direct budget without opening a pstack run is treated like one with open gates: strict blocks the stop and blocks `edit`/`write`/`ast_edit` before a run exists (unless the prompt routed direct); headless auto and strict report on stderr and exit `headlessOpenGateExitCode`. The change is measured from git tree snapshots taken through a throwaway index, so `bash` writes count and the user's index is untouched. Four host scenarios cover it.

### Changed

- Strict mode no longer lets an ungrounded request stay direct: the policy requires `pstack_gate action=init` before editing. Auto states the direct budget explicitly.
- `capture-writer-tools` changes three files through builders without a run, so it now expects the tripwire's exit 3.

### Fixed

- The router no longer forces a playbook it cannot justify. A request without a playbook signal (no keyword match, a lone generic verb, or non-English text) is `grounded: false`; the injected policy names no playbook and tells the model to choose from the `skill://pstack` routing table, stay direct for small local edits, and use `pstack-figure-it-out` when no row fits. Grounded suggestions may be overridden by a better row. `pstack_gate init` says when its playbook is only the fallback. "rename this variable" routes `direct`.
- Headless runs no longer end silently with open gates. Strict gate-only runs block the stop twice by default; a process without a UI that ends with an active run prints the gate report to stderr, records `headless_open_gates`, and exits 3 (`headlessOpenGateExitCode`).
- Async task actors whose `wait` was skipped by a queued completion notice no longer stay pending forever. Reconciliation reads delivered `async-result` notices from the branch and matches snapshot rows by spawn key when no job or runtime id was learned; headless shutdown reconciles before judging the run.
- `npm run check` builds on a clean install: the Node shim declares `randomUUID`.

### Added

- Host runner fields `expectExit` and `persistSession`, assertion `anyOf`, and six host scenarios: ungrounded Vietnamese routing, grounded routing, direct rename, headless strict open gates, headless exit override disabled, and a three-process `--continue` resume.

## 0.5.0 - 2026-09-24

### Fixed

- **BUG-1:** `off` mode no longer opens or mutates pstack gates; active runs remain evaluable after a mode change.
- **BUG-2/3:** `verify-with-omp` resolves the real host OMP, supports the pinned 18.2.11 baseline and 18.3.0 matrix, and has an offline mock smoke.
- **BUG-4/5/6:** documentation now distinguishes OMP-owned isolation, child tool admission, shell-capable reviewers/verifiers, and unverified UI/provider boundaries.
- **BUG-7:** `wait` and `hub op=wait` reconcile terminal task-result markers idempotently, including hosts that consume terminal rows from the job snapshot.
- **BUG-8:** agent tool declarations match the pinned OMP catalog; unavailable `find`, `lsp`, `ast_grep`, `browser`, and `computer` declarations were removed or replaced with the supported Eval bridge.
- **BUG-9:** builders and synthesizers resolve through `@pstack_code`, `@task`, and `@smol` fallback chains when model roles are not configured.

### Added

- Twenty-three upstream-mapped principles, twelve OMP-adapted operators, thirty task playbooks, and fifteen reusable workflow skills.
- Blinded router evaluation with positive and near-miss cases for every playbook.
- Panel reviewers A/B/C, `pstack-judge-b`, comment-sicko review, autonomous/pause/worktree cleanup, and multi-day orchestration/autopilot playbooks.
- Read-only OMP worktree audit, generated NOTICE attribution, and five additional live host scenarios for panel, isolation, comment review, and judge routing.

### Changed

- Upstream attribution is pinned to Cursor plugins commit `12d587d`; `scripts/upstream-map.json` and generated `NOTICE.md` track imported paths and fidelity.
- Release documentation reports 12 agents, 30 playbooks, 12 operators, 23 principles, 77 router cases, and host verification on OMP 18.2.11 and 18.3.0.
- Non-isolated writer warnings now persist a structured `writer_not_isolated` audit checkpoint; concurrent audit writes use collision-free temporary files.

### Documentation corrections

- OMP owns builder/synthesizer task isolation; pstack requests isolation and warns when OMP runs a writer without it.
- `pstack-reviewer` and `pstack-verifier` are shell-capable and can mutate through Bash despite having no `edit`/`write` tools; the child guard blocks parent-state `pstack_*` and `hub`, while OMP owns other tool admission.


## 0.4.0 - 2026-09-24

This release continues the pre-migration 0.3.9 line as the `pstack-omp` 0.4.0 release.

OMP now owns lifecycle, planning, orchestration, model routing, tool admission, and isolation. Pstack keeps only proof state and completion gates. Compatibility was probed against OMP 18.2.11 (`test/fixtures/omp-probe-18.2.11`).

### Breaking

- `pstack_run` is replaced by `pstack_gate` with `init`, `check`, and `abandon`. Phase, pause, resume, and skip-step actions are removed; plan with OMP and record skips as `pstack_decision`.
- `/pstack init|check|abandon` replace `/pstack start|phase|pause|resume|complete|fail|reset|gate`.
- Run status is `active | done | failed`. Session state moved to `pstack-omp/state-v2`; version 1 state is not restored.
- `enforceBuilderIsolation` is removed. Pstack never rewrites `isolated`; it warns when a builder/synthesizer ran without OMP task isolation.
- Model routing no longer injects `@pstack_*` patterns. Only verifier spawns are reordered, within OMP's own candidates, to prefer a family different from the latest writer.

### Added

- OMP goal gating: `goal op=complete` is refused while gates are open. The run binds to `Goal.id`; goal `complete` closes the run and `dropped` fails it. While the bound goal is live, `session_stop` defers to OMP's goal continuation instead of double-blocking.
- `maxStopGateBlocks` (default `0`): a run that cannot pass its gates no longer loops on `session_stop`; the session ends with a warning and the run stays `active`.
- Gate-only fallback when goal mode is off (for example `omp -p`): `pstack_gate action=check` closes the run.
- Asset tests: no pstack agent declares `task` or `spawns`, and proof-producing agents are blocking.

### Changed

- Plugin manifest moved to `.omp-plugin/plugin.json` (OMP-native, takes precedence); `.claude-plugin/` and `.github/` removed.
- Removed the automatic `pstack:auto` hook-status row from the default OMP UI; status remains available through `/pstack` and `pstack_status`.
- Pstack now defaults to `off` for new sessions; explicit `/pstack` mode changes remain session-persisted and are restored from OMP session entries.
- The official marketplace and plugin identity is now `pstack-omp`; remove legacy `ompstack` marketplace registrations before reinstalling.

- Built against the real `@oh-my-pi/pi-coding-agent@18.2.11` types (exact devDependency); the hand-written shim is gone. This fixes 0.1.0 failing to load in OMP (`Type.Object is not a function`).
- Session kind is tri-state (`main | subagent | unknown`) from `session_init` only; unreadable sessions cannot touch parent state.
- The child guard blocks only `pstack_*` and `hub`; OMP enforces each agent's `tools` list.
- Builder and synthesizer are `blocking: true`, because OMP delivers structured output only for blocking tasks.
- Result ingestion accepts only valid structured output whose schema `source` is `agent`.
- The fingerprint always excludes `.omp/pstack` and `auditDirectory`; a custom `fingerprintIgnore` previously let audit writes make every verdict stale.
- Fingerprints run git through the injected OMP `exec` (`ExecRunner`) instead of `node:child_process`.

## 0.1.0 - 2026-09-23

- Initial session-level OMP port of pstack workflow semantics.
- Added sticky `off`, `auto`, and `strict` modes with proportional ceremony routing.
- Added parent-owned, session-persisted run state plus human-readable audit snapshots.
- Added scout, architect, builder, reviewer, judge, synthesizer, and verifier agents with strict structured output.
- Added child-session detection and parent-side ingestion of evidence, acceptance outcomes, and verdicts; child extension instances never mutate parent state.
- Added defensive child runtime guards for leaked `pstack_*`, direct mutation, Hub, nested-task, and shell capabilities according to role.
- Added forced worktree isolation for builders/synthesizers and frozen contracts for review/verification.
- Added Git and bounded non-Git artifact fingerprints, stale-verdict rejection, and partial-fingerprint disclosure.
- Added synchronous, concurrent, and background task lifecycle correlation and reconciliation.
- Added writer/verifier provenance, verifier-completion checks, cross-family model preference, and `PASS` / `FAIL` / `INCONCLUSIVE` semantics.
- Added completion gates for acceptance, evidence, active workers, actor separation, current fingerprints, verdicts, and skip/waiver reasons.
- Added sixteen playbooks, twelve reusable operators, twenty-three engineering principles, and eight strict schemas.
- Added Go API and browser-app verification-skill examples.
- Added unit/integration tests, twelve negative topology fixtures, a thirty-three-case routing corpus, package/asset validation, and target-host smoke scripts.
