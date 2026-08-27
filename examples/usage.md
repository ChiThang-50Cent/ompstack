# Usage examples

These examples illustrate the task shapes the skill should prefer. They are not shell commands.

## Small bug

```text
/ompstack Fix the cache invalidation bug when an existing user changes organizations. Reproduce the failing lookup first.
```

Expected routing: Medium unless evidence shows a shared/core blast radius. Parent or one default `task` worker implements, then deterministic reproduction + one independent verifier/reviewer.

## High-risk feature

```text
/ompstack Add idempotency for webhook delivery. Persistence and concurrency semantics are high risk. Compare viable designs only if the current architecture leaves a real choice, then implement and independently verify duplicate delivery.
```

Expected routing: High. `ompstack-architect` if needed, default `task` owner, parent gates, `reviewer` + `ompstack-verifier`.

## OMP-native implementation batch

The parent can use a task batch conceptually like:

```json
{
  "context": "# Goal\nImplement the agreed webhook idempotency design.\n# Shared contracts\nUse the existing event key as the idempotency key. Preserve the public handler API. Parent will run broad tests after fan-in.",
  "tasks": [
    {
      "name": "PersistenceLane",
      "task": "# Target\nPersistence/repository layer for webhook events.\n\n# Change\nImplement atomic idempotency storage using the agreed contract. Do not change the public handler API.\n\n# Acceptance\nLeave the lane compiling locally and report the exact files changed plus any narrow test you ran. Skip project-wide lint/build/test; parent will run shared gates."
    },
    {
      "name": "HandlerLane",
      "task": "# Target\nWebhook handler/service path.\n\n# Change\nConsume the agreed repository idempotency contract and return existing behavior for duplicate deliveries.\n\n# Acceptance\nReport changed files and the narrow behavior exercised. Skip project-wide lint/build/test; parent will run shared gates."
    }
  ]
}
```

Notice that implementation items omit `agent`; the OMP default `task` worker is the intended owner.

## Independent evidence batch

After deterministic gates pass, a high-risk change may use specialized agents:

```json
{
  "context": "Review the current combined change for the webhook idempotency goal. Deterministic targeted tests are already green. Do not edit.",
  "tasks": [
    {
      "name": "PatchReview",
      "agent": "reviewer",
      "task": "Review the current diff for patch-introduced correctness issues, regressions, and edge cases. Focus on persistence and duplicate-delivery semantics."
    },
    {
      "name": "BehaviorVerification",
      "agent": "ompstack-verifier",
      "task": "Independently exercise duplicate delivery against the current worktree using the narrowest existing test/reproduction surface. Return PASS, FAIL, or BLOCKED with exact evidence."
    }
  ]
}
```

Add `security-reviewer` only when the actual change crosses a security boundary.
