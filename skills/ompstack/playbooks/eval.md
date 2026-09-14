# Workflow evaluation

Use this when changing `ompstack` skills, custom agents, commands, routing policy, or evaluation fixtures. Those changes alter agent behavior; do not treat them as documentation-only.

## 1. Name the policy claim

State the behavior expected to improve and the quality gate that must not regress. Examples: selecting the right playbook, naming a proof surface, avoiding needless delegation, or preserving a required independent verifier.

## 2. Run deterministic contract checks

Run `bun run check`. It validates skill routing, custom-agent definitions, command wiring, preflight requirements, and the shape of the golden routing set in `tests/fixtures/routing-cases.json`.

Update the golden routing set whenever a route, overlay, phase, or preflight policy changes. Each case must name its primary route, overlays, phases, progress tracking, risk, proof surface, write ownership, and independent evidence.

For native Todo policy, include narrow/read-only no-Todo, multi-phase Todo, queue/fan-in Todo, and Doctor-blocked Todo cases. Score correct progress-tracking selection, parent-only transitions, exact blockers, fan-in before completion, stale-proof reruns, and unnecessary Todo creation; do not score raw Todo call count as success.

For Task/Hub fan-in policy, include a partial-fan-in case, a failed or truncated lane case, and a case where a completed job claims an artifact that the parent has not inspected. Score whether the parent distinguishes job completion from acceptance, waits for every recorded lane, reads the required output/history/artifact, and withholds synthesis and the shared gate while any lane remains unresolved.

For proof-surface selection policy, include web interaction, CLI/TUI behavior, API/service behavior, live-state diagnosis, and symbol-refactor cases. Judge whether the selected driver can observe the stated claim, whether Browser is routed through Eval, whether LSP is paired with an existing behavior pin, and whether unavailable real surfaces remain `BLOCKED` rather than downgraded to static checks.

For opt-in OMP capability policy, include an already armed Prewalk case, an already enabled Advisor case, an explicit session handoff case, and a conflicting-memory case. Score whether Prewalk remains an operator choice with no model/config pinning, Advisor remains inspection-only advisory coverage rather than a completion gate, handoff uses persisted session artifacts before `/handoff` or `/export` without unauthorized sharing, and memory is cited then revalidated against the current repository rather than followed as instructions.

For risk-routing policy changes, use a causal fixture family rather than one incident-shaped prompt. Include a shared semantic-boundary case, a renamed/domain-shifted twin with the same risk facts, a local bounded control, and a material-uncertainty control. The fixture identifiers, expected verdicts, and scoring rubric remain hidden from the evaluated agent. Score whether the agent inspected the mutation target before final risk, named source evidence for the risk basis, selected High for hard triggers, and preserved Medium for the local control.

## 3. Design a blinded paired behavioral evaluation

Use the same repository revision, user prompt, model, thinking level, tool availability, timeout, and budget for a bare run and an `ompstack` run. The bare arm must run with this plugin/skill disabled so automatic skill selection cannot apply the policy under test. If that control cannot be isolated while preserving the other controls, record the evaluation as invalid. Record unavailable controls such as seed rather than pretending they were fixed.


Give the arms neutral identifiers. Remove baseline/candidate labels from prompts, filenames, directories, artifact names, and metadata visible to the judge. Use one blinded judge to score both arms against the same rubric in one comparison. Require the judge to inspect transcripts, tool calls, and produced artifacts rather than accepting each arm's self-report.

Require this structured output with `outputSchema` and `schemaMode: "strict"` for a non-Low write-task route decision:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "route": {
      "enum": [
        "investigation",
        "bug-fix",
        "feature",
        "refactoring",
        "prototype",
        "perf-issue",
        "runtime-forensics",
        "trace-forensics",
        "eval"
      ]
    },
    "overlays": {
      "type": "array",
      "items": { "enum": ["queue"] },
      "uniqueItems": true
    },
    "phases": {
      "type": "array",
      "items": { "enum": ["verification"] },
      "uniqueItems": true
    },
    "progressTracking": {
      "enum": ["none", "native todo"]
    },
    "risk": { "enum": ["low", "medium", "high", "critical"] },
    "riskBasis": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "mutationTarget": { "type": "string", "minLength": 1 },
        "semanticBoundary": {
          "enum": ["local", "shared", "public", "security", "unknown"]
        },
        "consumerFamilies": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 },
          "minItems": 1
        },
        "executionModes": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 },
          "minItems": 1
        },
        "hardTriggers": {
          "type": "array",
          "items": {
            "enum": [
              "shared-semantic-boundary",
              "multiple-execution-modes",
              "graph-traversal",
              "public-compatibility",
              "persistence",
              "concurrency",
              "material-uncertainty"
            ]
          },
          "uniqueItems": true
        },
        "remainingUncertainty": { "type": "string", "minLength": 1 },
        "evidence": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 },
          "minItems": 1
        }
      },
      "required": [
        "mutationTarget",
        "semanticBoundary",
        "consumerFamilies",
        "executionModes",
        "hardTriggers",
        "remainingUncertainty",
        "evidence"
      ]
    },
    "proofSurface": { "type": "string", "minLength": 1 },
    "writeOwnership": { "type": "string", "minLength": 1 },
    "independentEvidence": {
      "enum": [
        "none",
        "reviewer",
        "verifier",
        "reviewer + verifier",
        "security-reviewer",
        "reviewer + verifier + security-reviewer"
      ]
    }
  },
  "required": [
    "route",
    "overlays",
    "phases",
    "progressTracking",
    "risk",
    "riskBasis",
    "proofSurface",
    "writeOwnership",
    "independentEvidence"
  ]
}
```

Do not expose the scoring rubric or competing variants to the evaluated agent. Run a stratified set that includes read-only, bug-fix, feature, refactoring, runtime, and parallel-work requests.

For verification-lifecycle policy changes, include project capability creation, a Doctor-blocked runtime, maintenance of a stale feature map, and a narrow task that must not create infrastructure. Judge these cases for correct scope as well as route selection.

## Requirement-reconstruction evaluation

Evaluate reconstruction as a preflight policy against one pinned **evaluation revision** that includes this policy. Record the pre-policy base revision separately only for provenance; it is not an execution identity. Every A, B, and B′ run artifact must carry the same exact evaluation-revision SHA. A runs at that revision with the reconstruction overlay disabled; its output must not contain `reconstruction`, `requirements`, `derived_requirements`, or `affected_surfaces`. This makes the baseline configuration observable rather than inferred. Preserve raw original-evidence locators, the recorded High/Critical or evolved-Medium eligibility decision, and the candidate-visibility declaration in each arm artifact.

Use a corpus of fixture families with provenance/difficulty classes. Every positive omission needs a machine-addressable `target_id`, canonical target representation, deterministic aliases where needed, and arm-specific eligible recovery slots. Canonical shared slots are exactly `findings` and `closeout`: if either is eligible for one arm, it must be eligible for every arm. `finding_records` is not a valid alias. B-only slots use `reconstruction.requirements`, `reconstruction.derived_requirements`, and `reconstruction.affected_surfaces`; B′ uses their frozen-map counterparts without the `reconstruction.` prefix. Include an underspecified-request control, whose correct result is `INSUFFICIENT_EVIDENCE` rather than an invented requirement, and a bounded-local/material-uncertainty control. Do not report an empirical outcome for an arm without verified rollout artifacts.

Use `bun scripts/run-reconstruction-arm.mjs <specification.json>` to create a run artifact from an OMP session. The specification names family/twin/rerun/arm, shared post-policy SHA, candidate `cwd`, prompt, output path, session directory, model controls, and test-command regex. The runner writes a scorer-ready `run`, the full Phase-0 telemetry (`model_turns`; input/output/cache-read/cache-write tokens; tool counts and captured-output bytes; test-command reinvocations; compaction/pruning events; wall time), and the arm invocation. It clears prior generated output/session paths before each invocation. It runs A with `--no-skills`; B/B′ with `--skills ompstack --plugin-dir …` and a session-level `skill://ompstack` tool-read/result preflight. B′ requires R1 and freeze output paths: the harness runs candidate-visible R1, validates and freezes its map before a separate R2 invocation, then creates the digest binding itself. Do not hand-author run artifacts.

### Deterministic recovery and anchor validity

Compute **SORR-strict** deterministically: a seeded target is recovered only if it appears in a corpus-declared eligible slot, never by scanning raw evidence, transcripts, tool output, source snippets, search results, or incidental mentions. For A, eligible slots are reviewer/verifier findings, existing structured findings, and an explicitly eligible closeout statement. For B and B′, they additionally include `requirements`, `derived_requirements`, `affected_surfaces`, semantic review findings, and an eligible closeout section; raw-evidence and provenance fields that merely copy source text are ineligible. A baseline with no equivalent structured slot must record that limitation as observable recovery under the current workflow.

For B, score a semantic reviewer finding only from `requirementReconstructionBReviewerEnvelopeV1` after the parent validates the strict envelope and binds every finding `source_evidence` ID to `reconstruction.evidence`. An unbound, malformed, or unaccepted B finding is not an eligible recovery slot or anchor-judge input.

SORR establishes recovery, not correctness. A separate blinded anchor judge receives neutral packets with no arm identity and labels blocking findings `VALID_EXPLICIT`, `VALID_DERIVED`, `REPO_INVARIANT`, or `UNSUPPORTED`. A `VALID_DERIVED` finding must cite source evidence, provide a checkable derivation, and add no product assumption. Report the **UNSUPPORTED blocking-finding rate** as unsupported blocking findings divided by all blocking findings; do not substitute a differently defined “non-anchored” metric. Deterministic gates and real execution evidence retain authority over model judgments and over any judge result.

### Paired materiality and promotion gates

Run A first. The initial A-only materiality sample is 8 families × 2 domain-shifted twins × 3 reruns (48 runs), with the six positive families determining SORR. If the A seeded-omission miss rate is below 15%, report `OMISSION_MATERIALITY_NOT_ESTABLISHED` and do not run B or B′. The 15% threshold applies only to this pinned corpus.

If materiality is established, compare arms by paired family: calculate each twin's rerun success rate, average twins within a family, give every family equal weight, and compare arms by family. Promote B only when all of these gates pass: SORR(B) − SORR(A) ≥ 10 percentage points, improvement in at least 3 of 6 positive families, no more than a 5-point regression in unsupported blocking-finding rate, median tokens no more than 1.20× A, and residual miss rate below 10%. Promote B′ over B only when all of these gates pass: SORR(B′) − SORR(A) ≥ 10 points, SORR(B′) − SORR(B) ≥ 10 points, incremental improvement in at least 3 of 6 positive families, no more than a 5-point unsupported-rate regression, median tokens no more than 1.50× B, and residual miss rate below 10%. Do not implement or evaluate C, candidate isolation, a custom Auditor, or a dispute protocol under these gates.

Report paired uncertainty for every threshold, including the A-only 15% gate. Bootstrap by preserving family, both twins, and all their reruns as clusters. The only preregistered escalation is 3 reruns, then 5 for every arm in the relevant paired comparison if a 3-rerun interval covers a threshold; stop at five. If the interval still covers the threshold, report `BORDERLINE`, do not promote new machinery or open a later stage solely from it, and do not continue to 7, 9, or outcome-selected rerun counts.

Report quality before cost: per-family SORR and recovery limitations, anchor-validity distribution and unsupported blocking-finding rate, required proof-surface execution, scope-creep and false-complete rates, and distinct-evidence yield. Then report model turns; input, output, cache-read, and cache-write tokens; tool invocation counts and captured-output bytes; normalized test-command reinvocations; compaction/pruning events; and wall time. Retain paired artifacts, neutral judge packets, and uncertainty intervals with the experiment status; never replace this evidence with a self-report.

## 4. Compare evidence

Report quality before cost:
- resolved or quality-gate-pass rate
- required reproduction or proof-surface execution rate
- incorrect routing, missing contracts, and false-complete claims
- delegations or reviews that produced no distinct evidence
- token usage, request count, and wall time

For a cost-policy change, retain per-run model turns; input, output, cache-read, and cache-write tokens; tool invocation counts and captured output bytes; normalized test-command reinvocations; and compaction or pruning events. Aggregate token totals alone cannot identify the dominant cost.

A single task is calibration, not a conclusion. Attribute differences to the policy only when repeated paired results support them.

## 5. Promote or reject

Promote only when quality is non-inferior and the observed trade-off is acceptable. Keep the golden case and paired evidence with the change. Reject or revise a policy that lowers proof-surface execution or raises false confidence, even if it saves tokens.

## Reply

State the policy claim, deterministic check result, paired setup, quality and cost results, recommendation, and remaining uncertainty.
