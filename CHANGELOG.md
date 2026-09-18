# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.3.7] - 2026-09-18

### Added

- Added `scripts/eval-aacr.mjs` to evaluate shipped routing behavior against positive AACR-Bench samples with M1–M4 summaries by project language.
- Added resumable AACR records with commit-availability tracking, labeled-path base validation, detached target worktrees, and explicit invalid-base-design status.

### Changed

- Documented AACR-Bench's missing clean-PR control group and the fixed-neutral-risk limitation that makes M1 an upper bound on the real false-negative rate.

## [0.3.6] - 2026-09-17

### Added

- Added `scripts/init-overlay.mjs` to generate deterministic, file-anchored repository overlay drafts with explicit paths requiring review.
- Added optional `reviewed` metadata to repository `pathRules`. Existing overlays that omit the field remain valid and retain their previous behavior; generated rules use `reviewed: false` to mark an unreviewed draft without affecting signal collection or routing. No runtime consumer enforces this metadata yet: linting unreviewed rules remains tracked in issue #2. Unlike detached advisory state, the field is accepted by the runtime overlay schema so that later lint or routing enforcement has a live integration path.

## [0.3.5] - 2026-09-17
### Added

- Added `docs/STATUS.md` as the release-maintained map of shipped behavior, current evidence, adoption cost, and open work.
- Added `.describe()` guidance for all six route facts and matching `skill://ompstack` input guidance.
- Added evaluator derivation of `behaviorAffecting` from every sampled change set.

### Changed

- **Breaking:** Removed `plannedWriteLanes` and `proofSurface` from `taskFacts`. Route input now rejects either retired field.
- Removed stale numbered gap references; unresolved work now has descriptive release notes or a linked issue.

### Fixed

- Added change-set `behaviorAffecting` derivation and, in the same release, made code classification fail closed for `.mjs`, `.js`, and unknown file types. The fail-open path never shipped to users.

## [0.3.4] - 2026-09-17

### Added

- Added a repository-selected risk-distribution evaluator with persisted JSON records and a non-degenerate distribution guard.
- Added repository routing overlays for path-level signal coverage, including explicit true flags and reviewed false coverage per sensitive dimension.
- Added overlay-adoption guidance.

### Changed

- Calibrated routing so partial import graphs limit blast-radius confidence without independently escalating risk; threshold warnings retain Medium routing.
- Raised the Medium affected-module threshold from one to two.

### Fixed

- Prevented `knownPathPatterns` from silently resolving sensitive signals to false. Overlay paths now require explicit per-flag coverage; shipped sensitive rules remain authoritative.

## [0.3.3] - 2026-09-16

### Added

- Added persisted runtime RouteDecisions bound to the checked-out working-tree snapshot, declared targets, and a change-set content digest.
- Added opt-in route-before-write enforcement, declared write-scope checks, material-route staleness after mutation, and session-state reconstruction across OMP session changes.
- Added deterministic routing inputs, tri-state signal collection, conservative import-graph analysis, and runtime integration coverage through OMP's extension loader and AgentSession.

### Fixed

- Blocked target-scope escapes through in-repository symlinks.
- Derived bootstrap versus material measurement purpose from the measured change set rather than trusting caller input.


## [0.3.2] - 2026-09-15

### Changed

- Included the README-linked design, benchmark evidence, and usage documents in the npm artifact.
- Clarified the README's reconstruction-runner checkout requirements.

## [0.3.1] - 2026-09-14

### Added

- Documented the 0.3 release and marketplace upgrade path in the README.
- Added native project guidance at `.omp/AGENTS.md`; marketplace plugin discovery does not inject it into consumer project context.
- Added ignore coverage and a pre-push cleanup requirement for local evaluation artifacts and unintegrated experiments.

## [0.3.0] - 2026-09-14

### Added

- Added strict requirement-reconstruction evaluation artifacts, deterministic SORR scoring, and the A/B/B′ arm runner with session telemetry.

### Fixed

- Bound evaluation artifacts to a clean, exact plugin checkout; constrained A baseline output; and froze B′ R1 state before R2 scoring.

## [0.2.3] - 2026-09-09

### Changed

- Finalize non-Low write-task risk from a direct mutation-target scan; unresolved material uncertainty now escalates to High and requires reviewer plus verifier evidence.

## [0.2.2] - 2026-09-09

### Changed

- Made the Ompstack workflow explicit-invocation only rather than the default for every coding task.


## [0.2.0] - 2026-09-08

### Added

- Added a workflow-evaluation playbook, deterministic plugin validator, and golden routing scenarios.
- Added measurement-first playbooks for performance issues, live runtime forensics, and captured trace analysis.
- Added route/overlay/phase coverage and custom-agent capability checks to the deterministic validator.

- Added native project verification capabilities: creation and maintenance skills, feature-map template, Doctor/Drive contract, and append-only decision-trail helper.
- Added a benchmark evidence record for the verified `psf__requests-2931` rerun.

### Changed

- Added a structured preflight contract for Medium, High, and Critical write work.
- Defined explicit write ownership, shared-contract ownership, integration order, and fan-in gates for parallel task batches.
- Separated blocking architecture comparison from implementation batches to match OhMyPi task execution semantics.
- Documented conditional OhMyPi task isolation and full Critical-risk review coverage.
- Corrected verifier Browser access to use the OMP Eval prelude and documented that no-edit behavior is a trusted policy rather than a sandbox.
- Separated primary workflow routing from the queue overlay and verification phase.
- Made task examples self-contained across dependent batches and explicit about asynchronous fan-in.
- Hardened workflow evaluation with neutral arm identifiers, one blinded judge, and transcript/artifact inspection.
- Routed verification through matching project-native `verify-<surface>` skills or repository proof surfaces, with Doctor blockers distinct from product failures.
- Added historical-rationale evidence guidance to read-only investigations.

### Fixed

- Restricted the npm artifact to runtime files so plugin upgrades do not package local logs, benchmark candidates, or research artifacts.
