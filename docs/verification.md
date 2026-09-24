# Verification

## Verification is a product adapter

The generic verifier knows how to avoid direct source editing, bind evidence to an artifact, and return a structured verdict. Its declared shell/browser/computer capabilities can still mutate the environment, so the project skill must define safe surfaces and cleanup. It cannot know how every product starts or what observable success means. A repository should therefore define:

```text
.omp/skills/verify-<project>/SKILL.md
```

The skill is an executable operational contract, not a slogan such as “run tests.”

## Parent-owned state

OMP custom agents run in child sessions with their own extension instance. A verifier must therefore **not** attempt to call `pstack_evidence`, `pstack_acceptance`, `pstack_fingerprint`, or `pstack_verdict`.

The normal flow is:

```text
verifier child
  → returns schema-valid structured report
  → OMP task result carries structuredOutput
  → parent pstack extension correlates the verifier actor
  → parent recomputes the current fingerprint
  → parent records evidence and acceptance outcomes
  → parent validates and records PASS / FAIL / INCONCLUSIVE
```

Parent `pstack_*` tools remain available to the coordinator/operator for run setup, decisions, diagnostics, and explicit recovery. They are not the child-agent transport.

## Required project-skill sections

1. Scope and excluded surfaces.
2. Dependencies and environment variables.
3. Exact start commands and readiness probes.
4. Idempotent fixture/state setup.
5. CLI/API/browser/worker/database/integration surfaces.
6. Acceptance-to-observation mapping.
7. Evidence output and redaction rules.
8. Fingerprint timing and generated-file behavior.
9. Cleanup and data preservation.
10. Known limitations requiring `INCONCLUSIVE`.

## Verifier output contract

The bundled verifier schema requires:

- `verdict`: `PASS`, `FAIL`, or `INCONCLUSIVE`;
- `scope`;
- `tested_fingerprint` with kind, digest, and partial flag;
- product `surface`;
- concrete `observations`;
- structured `evidence` rows with kind, claim, and inspectable reference;
- `limitations`;
- one `acceptance_results` row per required criterion.

Example:

```json
{
  "verdict": "PASS",
  "scope": "password-reset single-use behavior",
  "tested_fingerprint": {
    "kind": "git",
    "digest": "sha256:...",
    "partial": false,
    "head_sha": "abc123"
  },
  "surface": "HTTP API plus session invalidation observation",
  "observations": [
    "The first reset succeeds.",
    "Reusing the same token returns the contracted invalid-token response."
  ],
  "evidence": [
    {
      "kind": "reproduction",
      "claim": "The original token-reuse failure no longer reproduces.",
      "ref": "artifacts/reset-token-repro-after.log"
    }
  ],
  "limitations": [],
  "acceptance_results": [
    {
      "id": "acceptance-single-use",
      "outcome": "passed",
      "evidence_refs": ["artifacts/reset-token-repro-after.log"]
    }
  ]
}
```

## Evidence model

Every evidence row should include:

- a precise claim;
- a reference another actor/operator can inspect or reproduce;
- an evidence kind;
- the product surface or command context when it is not obvious.

Strong references include:

```text
artifacts/repro-before.log
artifacts/repro-after.log
artifacts/benchmark.json
screenshots/reset-success.png
trace://local-run/42
command: go test ./internal/auth -run TestTokenSingleUse -count=1
```

A bare claim such as “all tests pass” is weak because it omits command, scope, output, environment, and artifact identity.

The parent assigns deterministic evidence IDs and stores the producing verifier actor. References in `acceptance_results` are translated to stored evidence IDs when they match a reported evidence path.

## Verdict semantics

### PASS

All required acceptance criteria are observed on the exact target artifact, required evidence exists, limitations do not undermine the claim, and writer/verifier separation holds.

The parent downgrades a reported PASS to `INCONCLUSIVE` when, among other structural failures:

- the tested fingerprint is missing or stale;
- a required criterion is missing or not passed;
- required evidence is absent;
- actor provenance is invalid;
- the verifier is also a writer.

### FAIL

At least one required criterion is contradicted by observed behavior. The report should include the smallest reproduction and relevant evidence.

### INCONCLUSIVE

The correct surface cannot be exercised or evidence is insufficient. Examples:

- required external sandbox unavailable;
- browser target cannot start;
- credentials are inaccessible;
- fingerprint is partial in a way that can hide relevant mutation;
- measurement variance prevents the claimed performance result.

`INCONCLUSIVE` is not a soft PASS. Pause or rescope the run.

## Fingerprint sequence

Recommended verifier sequence:

```text
1. Read the target fingerprint embedded in the verifier contract.
2. Start/seed the product without editing the source artifact.
3. Execute the acceptance observations.
4. Capture inspectable evidence.
5. Recompute or otherwise confirm the final target digest.
6. If the artifact changed, diagnose and retest the new artifact.
7. Return the schema-valid structured report.
```

The parent independently recomputes the current fingerprint during ingestion. A child-reported digest alone is never accepted as proof of freshness.

If test startup generates source-controlled assets, generation changes the artifact and verification must target the post-generation digest.

## Original reproduction

For bug fixes, preserve the original failure surface before editing. Verification should rerun it rather than substitute an easier proxy introduced by the fix. Supporting unit tests can localize the cause; the reproduction demonstrates that caller-visible behavior changed.

## Examples

- `examples/verify-go-api/SKILL.md`
- `examples/verify-web-app/SKILL.md`

These are templates. Replace ports, commands, routes, fixtures, selectors, and cleanup with repository-specific evidence.
