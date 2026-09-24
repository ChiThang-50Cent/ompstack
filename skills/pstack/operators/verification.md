# Operator: Independent verification

Verification answers whether the exact artifact satisfies frozen acceptance on the real product surface.

## Inputs

- target fingerprint;
- objective and required acceptance criteria;
- original reproduction or usage path;
- writer actor IDs;
- project verification skill;
- relevant environment constraints.

## Procedure

1. Parent computes the target fingerprint and injects the frozen verifier contract.
2. Spawn `pstack-verifier` as a distinct, blocking actor with no `edit`/`write` tools; treat any Bash/browser/computer capability as potentially mutating.
3. Verifier starts/seeds the system through reproducible project instructions.
4. Verifier drives user/caller surfaces plus negative and adjacent cases.
5. Verifier captures commands, raw outputs, logs, traces, screenshots, or benchmark files.
6. Verifier confirms the tested fingerprint and returns strict structured output.
7. Parent extension ingests evidence and acceptance outcomes, validates provenance/freshness, and records PASS/FAIL/INCONCLUSIVE.

The child verifier cannot mutate parent pstack state and must not call `pstack_*` tools. PASS requires distinct writer/verifier actors, evidence for every required criterion, and a matching artifact fingerprint. Build/CI/test green alone is a proxy unless it is itself the contracted surface. INCONCLUSIVE remains non-success.
