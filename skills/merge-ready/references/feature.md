# Feature changes

Use for new user-visible or externally observable behavior.

1. Recover the existing product model before proposing semantics: actors, permissions, entities, lifecycle, API/UI conventions, errors, persistence, jobs, events, and compatibility boundaries.
2. Turn the model into explicit acceptance criteria. Include happy and unhappy paths, authorization, invalid input, missing resources, duplicate/retry behavior, concurrency, expiry/revocation, partial failure, restart, and observability where applicable. Mark criteria required or optional with provenance.
3. Resolve consequential ambiguities in one clarification batch or preserve optionality with a recorded assumption. Create a versioned contract with `mr_contract` before implementation.
4. For MEDIUM/HIGH work, freeze a design brief and clean ownership slices before delegating. Implementers must not change product semantics without escalation.
5. Prove each required criterion at the relevant real surface, not merely by compiling or running unit tests. Register receipts with exact commands, reports, URLs, or artifact paths.
6. Open the PR as soon as the patch is coherent, then continue current-patch review, verification, CI, and babysitting until `mr_gate` passes.
