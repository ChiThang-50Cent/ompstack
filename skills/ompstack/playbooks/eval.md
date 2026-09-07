# Workflow evaluation

Use this when changing `ompstack` skills, custom agents, commands, routing policy, or evaluation fixtures. Those changes alter agent behavior; do not treat them as documentation-only.

## 1. Name the policy claim

State the behavior expected to improve and the quality gate that must not regress. Examples: selecting the right playbook, naming a proof surface, avoiding needless delegation, or preserving a required independent verifier.

## 2. Run deterministic contract checks

Run `bun run check`. It validates skill routing, custom-agent definitions, command wiring, preflight requirements, and the shape of the golden routing set in `tests/fixtures/routing-cases.json`.

Update the golden routing set whenever a route, overlay, phase, or preflight policy changes. Each case must name its primary route, overlays, phases, risk, proof surface, write ownership, and independent evidence.

## 3. Design a blinded paired behavioral evaluation

Use the same repository revision, user prompt, model, thinking level, tool availability, timeout, and budget for a bare run and an `ompstack` run. The bare arm must run with this plugin/skill disabled so automatic skill selection cannot apply the policy under test. If that control cannot be isolated while preserving the other controls, record the evaluation as invalid. Record unavailable controls such as seed rather than pretending they were fixed.

Give the arms neutral identifiers. Remove baseline/candidate labels from prompts, filenames, directories, artifact names, and metadata visible to the judge. Use one blinded judge to score both arms against the same rubric in one comparison. Require the judge to inspect transcripts, tool calls, and produced artifacts rather than accepting each arm's self-report.

Require structured output for the route decision with this `outputSchema` and `schemaMode: "strict"`:

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
    "risk": { "enum": ["low", "medium", "high", "critical"] },
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
    "risk",
    "proofSurface",
    "writeOwnership",
    "independentEvidence"
  ]
}
```

Do not expose the scoring rubric or competing variants to the evaluated agent. Run a stratified set that includes read-only, bug-fix, feature, refactoring, runtime, and parallel-work requests.

## 4. Compare evidence

Report quality before cost:
- resolved or quality-gate-pass rate
- required reproduction or proof-surface execution rate
- incorrect routing, missing contracts, and false-complete claims
- delegations or reviews that produced no distinct evidence
- token usage, request count, and wall time

A single task is calibration, not a conclusion. Attribute differences to the policy only when repeated paired results support them.

## 5. Promote or reject

Promote only when quality is non-inferior and the observed trade-off is acceptable. Keep the golden case and paired evidence with the change. Reject or revise a policy that lowers proof-surface execution or raises false confidence, even if it saves tokens.

## Reply

State the policy claim, deterministic check result, paired setup, quality and cost results, recommendation, and remaining uncertainty.
