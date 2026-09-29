# Independent verification

Verification proves requested behavior on the real acceptance surface. It is not a second code review and not an implementer self-report.

1. Start from the current contract and required acceptance criteria. Confirm the patch/head and packet context before exercising anything.
2. Prefer the user-visible API, CLI, UI, job, event, or persisted state surface. Use the same reproduction inputs and also cover relevant negative, authorization, retry/idempotency, and boundary cases. Unit tests are supporting evidence, not a substitute when a real surface exists.
3. Capture concrete evidence pointers: commands with exit status, test reports, logs, URLs, screenshots, traces, persisted values, or reproduction artifacts. Prose alone is not proof.
4. Return exactly one structured status: `PASS`, `PASS_WITH_NOTES`, `FAIL`, or `INCONCLUSIVE`, with criteria covered and evidence. `INCONCLUSIVE` never passes the gate.
5. If the patch changes, refresh and rerun any affected proof. Register receipts only from the root; the verifier has no product-code write tools and no `mr_*` tools.
6. Skipped tests are not proof. `mr_run_checks` reports skipped-test lines in its result and in `mr_state.skippedTests`. If an acceptance criterion depends on a test that can skip (missing service, env var, dependency), list that test name in the criterion's `evidenceTests`; the gate then fails while the current check run skips it. Run the check in an environment where it executes (same services and config as the real surface).
7. Check the environment, not just the exit code: the check command's database, services, and config must match the surface the criterion describes.
