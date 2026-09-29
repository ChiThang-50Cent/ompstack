# Bug changes

Use for a localized defect or regression.

1. Locate the real behavior surface and reproduce the failure before editing. Capture the command, inputs, expected/actual result, and concrete artifact pointer as a `repro_before` receipt where practical.
2. Trace the invariant and the smallest responsible boundary. Check retries, duplicate requests, authorization, missing data, concurrency, and compatibility instead of patching only the visible symptom.
3. Implement the narrowest fix consistent with existing conventions. Do not broaden product semantics or refactor unrelated code without a contract change.
4. Add or update a regression proof that would fail on the old behavior. Exercise the same real surface after the fix; unit tests alone are insufficient when an API, CLI, UI, job, or persisted state surface is available.
5. Recompute patch identity, register current self-proof, and route through the LOW/MEDIUM/HIGH rigor policy. A clear local bug commonly qualifies for LOW, but security, persistence, concurrency, or public-API impact raises rigor.

A passing reproduction after the fix is evidence of this patch only. Reviewers still receive a frozen packet, and the final gate still requires current CI, mergeability, and required independent evidence.
