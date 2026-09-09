# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

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
