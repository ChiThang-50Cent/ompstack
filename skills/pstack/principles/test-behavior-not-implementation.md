---
name: pstack-principle-test-behavior-not-implementation
description: Test Behavior, Not Implementation. Use when writing, repairing, or evaluating tests.
---
# Test Behavior, Not Implementation

**Trigger:** Use when writing, repairing, or evaluating tests.

Invoke code through the interface its caller uses and assert literal observable outcomes. Avoid tests that only confirm mocks were called or mirror implementation branches. Challenge the test with a known-bad mutation or fixture; if it still passes, it is not guarding the behavior.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
