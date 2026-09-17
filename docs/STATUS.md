# Current Project Status

**Snapshot:** `v0.3.4` (`2026-09-17`). Update this page in every release with shipped behavior, current evidence, and unresolved work.

## Where the project stands

Ompstack now has a persisted runtime routing boundary rather than a prose-only workflow:

- Explicit `/ompstack` or `/skill:ompstack` activation blocks mutable or unknown execution until a RouteDecision exists.
- A RouteDecision is bound to the checked-out working-tree candidate, declared target paths, and `changeSetDigest`.
- Bootstrap or material purpose is derived from the measured change set. A successful parent mutation makes a material decision stale before independent evidence can proceed.
- Declared write scope rejects paths outside the repository, paths outside declared targets, and target escapes through symlinks. Session changes rebuild this state from persisted entries.
- Routing measures tri-state signals, conservative import-graph reachability, direct risk facts, and policy thresholds. Partial graph information constrains blast-radius confidence; it does not independently elevate risk.
- The route-fact contract has six declarations: `taskFacts.behaviorAffecting`, plus `riskFacts.sharedSemanticBoundary`, `consumerFamilies`, `executionModes`, `graphTraversal`, and `materialUnknown`. `consumerFamilies: 0` and `executionModes: 0` mean unknown and force High; conservative declarations are not free because `materialUnknown`, either zero sentinel, or multiple families or modes require 2–3 evidence lanes.
- Code classification is separate from import-graph support: known JavaScript and supported graph-language extensions count as code, while any path outside explicit non-code coverage also counts as code. An unsupported graph language therefore cannot make real code non-behavior-affecting.
- RouteDecision remains at schema version `2`: this release changes the route-input contract, not the persisted RouteDecision body.

## Current evidence and adoption contract

- Deterministic repository check: `bun run check`.
- Test suite at this snapshot: **85 passing tests across 15 files**.
- `bun scripts/eval-risk-distribution.mjs --repo <path> --count <N> --output <file>` records a selected repository, sampled HEAD, sample size, and risk-tier distribution. It exits nonzero when the sample is entirely one tier.
- The evaluator derives `behaviorAffecting` from each sampled change set: it is `false` only when no code file changed and no sensitive signal is observed `true`. It fixes `riskFacts` at bounded values, so its distribution is a lower bound on risk rather than a production expectation.
- There is **no repository-independent risk distribution claim**. Evaluate a fixed sample for each target repository and retain its JSON record.
- A repository without overlay coverage remains deliberately conservative: unresolved sensitive signals route High.
- `.omp/ompstack-routing.json` requires path-level maintenance for Medium routing. `knownPathPatterns` only remove unclassified-path noise; `pathRules.flags` add observed sensitive signals and `pathRules.knownFlags` are reviewed negative claims. Broad false coverage can suppress required review and is not a valid substitute for a maintained sensitivity map.

## Release history

- `v0.3.3`: runtime RouteDecision authority, working-tree binding, session rebuild, mutable-scope enforcement, and purpose derivation.
- `v0.3.4`: classifier calibration, cross-repository risk evaluation, additive repository coverage, per-flag overlay safety, and adoption guidance.

See [`CHANGELOG.md`](../CHANGELOG.md) for complete release notes.

## Open work

- [Issue #1 — Clarify change-ledger size-cap semantics](https://github.com/ChiThang-50Cent/ompstack/issues/1): decide whether policy naming should say diff churn rather than file size.
- [Issue #2 — Deferred routing hardening](https://github.com/ChiThang-50Cent/ompstack/issues/2): protocol-path allow-list; `digestChangeSet` size and concurrency bounds; `/ompstack off`; derived route inputs; route conformance; output-quality telemetry; and machine-local digest documentation.

This repository uses descriptive release notes and issue titles for unresolved work. It does not maintain a separate numbered gap taxonomy.
