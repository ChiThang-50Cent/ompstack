# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Added

- Added a workflow-evaluation playbook, deterministic plugin validator, and golden routing scenarios.
- Added measurement-first playbooks for performance issues, live runtime forensics, and captured trace analysis.

### Changed

- Added a structured preflight contract for Medium, High, and Critical write work.
- Defined explicit write ownership, shared-contract ownership, integration order, and fan-in gates for parallel task batches.
- Separated blocking architecture comparison from implementation batches to match OhMyPi task execution semantics.
- Documented conditional OhMyPi task isolation and full Critical-risk review coverage.
