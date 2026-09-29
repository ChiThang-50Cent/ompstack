# Risk and rigor

Choose rigor from both engineering risk and product ambiguity; record the choice in the product contract.

| Rigor | Typical work | Minimum path |
| --- | --- | --- |
| LOW | localized bug with clear repro, copy/docs, mechanical refactor, small internal behavior change | owner implementation → direct proof → one independent code review → current CI/PR gate |
| MEDIUM | multi-module feature, reversible persisted state, existing-pattern API, moderate concurrency, several inferred decisions | grounding → explicit design → bounded slices → self-proof → two distinct code reviewers → product review → independent verifier → CI/PR gate |
| HIGH | auth/permissions, payments, irreversible migration, secrets/crypto, public API compatibility, cross-service consistency, high concurrency, destructive infrastructure | deep grounding → structurally different designs → synthesis → implementation → self-proof → replicated multi-model review → product review → security/domain review → live independent verifier → current CI → final gate |

Raise rigor when the surface is security-sensitive, persistent, public, concurrent, irreversible, or ambiguous. Lower ceremony for genuinely trivial changes only; never remove a required gate because it is inconvenient. If evidence cannot be obtained, use the precise blocked or inconclusive terminal state rather than claiming readiness.

## Effective rigor floor

The gate uses the maximum of the contract's declared rigor, MEDIUM when any sibling site is marked `fix`, and MEDIUM when an `inverse_direction` or `round_trip` row has an expectation other than `n/a`. Reviewers do not raise rigor. If this effective floor exceeds the contract declaration, satisfy the raised level; do not lower it or re-propose the contract merely to avoid its requirements. The gate reports the reason and missing raised-level evidence.

Product review is required from MEDIUM. A product review that reports contract gaps sends the run back to `SPEC_DISCOVERY` for complete scope analysis and a new contract version.
