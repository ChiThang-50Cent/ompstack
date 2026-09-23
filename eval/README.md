# Evaluation corpus

`cases.json` is a deterministic router/proportionality corpus. It is not a claim that keyword routing alone measures engineering quality.

Run:

```bash
npm run build
node eval/score-router.mjs
```

## Comparative experiment

For end-to-end harness evaluation, run the same repository tasks under frozen model/provider/tool settings:

```text
A. plain OMP
B. OMP + pstack skill assets only
C. OMP + full pstack-OMP extension/agents
```

Randomize task order and blind the evaluator to arm labels. Record:

- acceptance success on the real surface;
- regression escapes;
- unsupported completion claims;
- original-reproduction rerun rate;
- artifact-bound verifier rate;
- stale-verdict incidents;
- writer/verifier collision;
- unnecessary user questions for observable facts;
- unnecessary ceremony on direct tasks;
- tool calls, wall time, input/output tokens, and provider cost;
- failures caused by orchestration itself.

## Suggested seeded task families

- local typo/rename/direct change;
- investigation with relevant history;
- defect with misleading nearby code;
- feature crossing one and several boundaries;
- performance task where intuition is wrong;
- review with seeded high/low/noise findings;
- async worker that returns before completion;
- artifact mutation after a valid verdict;
- verifier unable to access the required surface;
- same-model-only environment.

## Scoring rules

- Do not award success for CI/test green unless the task's acceptance is exactly that check.
- `INCONCLUSIVE` is correct when the necessary surface is unavailable; it is not task success.
- Count a task as over-orchestrated when pstack adds roles/panels without changing correctness/evidence on a direct task.
- Separate routing correctness from execution correctness.
- Keep negative fixtures separate from the valid golden corpus so validation can remain green while asserting rejection behavior.
