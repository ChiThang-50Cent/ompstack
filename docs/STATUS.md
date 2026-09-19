# Current Project Status

**Snapshot:** `v0.3.8` (`2026-09-19`). Update this page in every release with shipped behavior, current evidence, and unresolved work.

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
- Test suite at this snapshot: **95 passing tests across 17 files**.
- `bun scripts/eval-risk-distribution.mjs --repo <path> --count <N> --output <file>` records a selected repository, sampled HEAD, sample size, and risk-tier distribution. It exits nonzero when the sample is entirely one tier.
- The evaluator derives `behaviorAffecting` from each sampled change set: it is `false` only when no code file changed and no sensitive signal is observed `true`. It fixes `riskFacts` at bounded values, so its distribution is a lower bound on risk rather than a production expectation.
- There is **no repository-independent risk distribution claim**. Evaluate a fixed sample for each target repository and retain its JSON record.
- A repository without overlay coverage remains deliberately conservative: unresolved sensitive signals route High.
- `.omp/ompstack-routing.json` requires path-level maintenance for Medium routing. `knownPathPatterns` only remove unclassified-path noise; `pathRules.flags` add observed sensitive signals and `pathRules.knownFlags` are reviewed negative claims. When rules overlap, every matching repository rule must establish a flag as known before collection resolves it false. Broad false coverage can suppress required review and is not a valid substitute for a maintained sensitivity map.
- `bun scripts/init-overlay.mjs --repo <absolute-path> [--force] [--dry-run]` generates a deterministic starting overlay. Its heuristic table lives in `policy/signals.json`: distinctive terms emit their mapped flags; common terms emit no flag and remove only that dimension from `knownFlags`, leaving it `unknown` until review. Every generated rule has `reviewed: false`: it is a draft that requires human confirmation, not an assertion that the path is safe. The field is optional and metadata-only, so existing overlays that omit it remain valid and are not implicitly treated as drafts. Nothing consumes `reviewed` as an enforcement signal yet; issue #2 tracks linting unreviewed rules.
- `bun scripts/eval-aacr.mjs --dataset <path> --workdir <path> [--limit N] [--language Go,Python,TypeScript,Java] [--output <file>] [--resume]` evaluates routing against AACR-Bench positive samples. It generates a deterministic overlay in each detached target worktree, fixes neutral risk facts, records M1–M4 plus M3b by language, and persists commit-availability and labeled-path base-validation exclusions.
- AACR-Bench has no clean-PR control group, so this evaluator cannot measure or infer over-triage. Its neutral fixed risk facts minimize assigned risk; M1 is therefore an upper bound on the real false-negative rate. A record with more than 15% base-validation exclusions is marked `invalid-base-design` rather than treated as valid evidence.
- **M1 is not measurable on the PR corpus.** `classify-route.mjs` emits Low only when `behaviorAffecting === false`; every corpus PR changes code, so the M1 denominator is structurally zero.
- **M2 is nearly tautological.** 97/102 corpus PRs already contain `Code Defect` or `Security Vulnerability` (95%), so the observed 94% is close to the base rate and is not a useful layer-comparison metric.

The tiered overlay was checked against 12 first-parent commits from each pinned external repository with neutral `riskFacts`:

| repository | sampled HEAD | low | medium | high | critical | critical-flag files |
|---|---|---:|---:|---:|---:|---:|
| `psf/requests` | `dae7ef63b4df6eded86637f251fc4e3a06c3b479` | 0 | 3 | 9 | 0 | 32/130 (24.6%) |
| `pallets/flask` | `d73fa1cdcbd8b1465c151db8924ba58b1dd14e35` | 1 | 6 | 5 | 0 | 9/236 (3.8%) |
| `spf13/cobra` | `adbc8813901bba65827259daa8e22ff94ec1f30e` | 0 | 2 | 8 | 2 | 8/66 (12.1%) |
| `sindresorhus/got` | `687eb7dcc100ea3e548ebba227173b886789e670` | 0 | 8 | 3 | 1 | 4/127 (3.1%) |

Every sample spans at least two tiers; no repository is degenerate. Critical-flag coverage stays below 30% on every repository, and all four retain Medium outcomes. Common-term matches account for uncertainty rather than blanket Critical escalation.

On the 13 supported-language security PRs selected from AACR-Bench commit `68a5697` (0 commit-unavailable and 0 base-validation exclusions), the tiered generator raised M3 from **2/13** on the pre-change overlay to **3/13**, while **M3b** (security PRs routed above Medium) reached **9/13**. The final M3 split was Go 2/6, TypeScript 1/4, Java 0/2, and Python 0/1; M3b was Go 5/6, TypeScript 4/4, Java 0/2, and Python 0/1. This is a positive-security-only slice, not a clean-PR precision estimate.

The expanded name-only analysis recognizes **9/13** security PRs at the path level. It cannot detect vulnerabilities whose path names carry no security cue, including `pkg/shellexec/shellexec.go`, `server/create.go`, and `pkg/remote/fileshare/pathtree/pathtree.go`. This is the measured capability ceiling of the overlay generator, not a content-analysis claim.

## Release history

- `v0.3.3`: runtime RouteDecision authority, working-tree binding, session rebuild, mutable-scope enforcement, and purpose derivation.
- `v0.3.4`: classifier calibration, cross-repository risk evaluation, additive repository coverage, per-flag overlay safety, and adoption guidance.
- `v0.3.5`: explicit route-fact guidance, fail-closed code classification, and evaluator task-fact derivation.
- `v0.3.6`: deterministic file-anchored overlay drafts, optional review metadata, and pinned cross-repository adoption evidence.
- `v0.3.7`: AACR-Bench routing evaluation, resumable records, labeled-path base validation, and evaluator limitations.

See [`CHANGELOG.md`](../CHANGELOG.md) for complete release notes.

## Open work

- [Issue #1 — Clarify change-ledger size-cap semantics](https://github.com/ChiThang-50Cent/ompstack/issues/1): decide whether policy naming should say diff churn rather than file size.
- [Issue #2 — Deferred routing hardening](https://github.com/ChiThang-50Cent/ompstack/issues/2): overlay lint and enforcement for `reviewed: false`; protocol-path allow-list; `digestChangeSet` size and concurrency bounds; `/ompstack off`; derived route inputs; route conformance; output-quality telemetry; and machine-local digest documentation.

This repository uses descriptive release notes and issue titles for unresolved work. It does not maintain a separate numbered gap taxonomy.
