import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../dist/src/state.js';
import { rewriteTaskInput, taskInputContainsAgent } from '../dist/src/task-rewrite.js';

const fp = { kind: 'git', digest: 'fp-123', generatedAt: '2026-09-23T00:00:00Z', partial: false, notes: [] };
const run = createRun({ objective: 'Add reset flow', playbook: 'feature', ceremony: 'strict', verificationRequired: true, acceptance: [{ id: 'AC-1', text: 'reset succeeds' }] });
run.agents.push({ actorId: 'writer-a', role: 'builder', agentName: 'pstack-builder', invocationKind: 'task', modelPatterns: [], status: 'completed', spawnedAt: 'x' });

test('never rewrites isolation and attaches verifier/reviewer contracts', () => {
  const input = { context: 'shared', tasks: [
    { name: 'build', agent: 'pstack-builder', task: 'Implement it', isolated: false },
    { name: 'verify', agent: 'pstack-verifier', task: 'Check it' },
    { name: 'review', agent: 'pstack-reviewer', task: 'Review it' },
    { name: 'review-a', agent: 'pstack-reviewer-a', task: 'Review it' },
    { name: 'review-b', agent: 'pstack-reviewer-b', task: 'Review it' },
    { name: 'review-c', agent: 'pstack-reviewer-c', task: 'Review it' },
  ]};
  const result = rewriteTaskInput(input, { run, fingerprint: fp });
  assert.equal(result.changed, true);
  assert.equal(result.input.tasks[0].isolated, false);
  assert.equal(result.input.tasks[0].schemaMode, 'strict');
  assert.equal(result.input.tasks[1].schemaMode, 'strict');
  assert.match(result.input.tasks[1].task, /Target fingerprint: fp-123/);
  assert.match(result.input.tasks[1].task, /Writers: writer-a/);
  assert.match(result.input.tasks[1].task, /Do not edit files or call pstack_\* tools/);
  assert.match(result.input.tasks[2].task, /frozen intent/i);
  for (const index of [2, 3, 4, 5]) {
    assert.equal(result.input.tasks[index].schemaMode, 'strict');
    assert.match(result.input.tasks[index].task, /frozen intent/i);
  }
});

test('contract replacement is idempotent rather than duplicating markers', () => {
  const first = rewriteTaskInput({ agent: 'pstack-verifier', task: 'Verify' }, { run, fingerprint: fp });
  const second = rewriteTaskInput(first.input, { run, fingerprint: fp });
  assert.equal((second.input.task.match(/pstack-task-contract:start/g) ?? []).length, 1);
});

test('agent detection supports flat, nested, and batch forms', () => {
  assert.equal(taskInputContainsAgent({ agent: 'pstack-verifier' }, 'pstack-verifier'), true);
  assert.equal(taskInputContainsAgent({ task: { agent: 'pstack-verifier', task: 'x' } }, 'pstack-verifier'), true);
  assert.equal(taskInputContainsAgent({ tasks: [{ agent: 'pstack-verifier', task: 'x' }] }, 'pstack-verifier'), true);
  assert.equal(taskInputContainsAgent({ agent: 'pstack-builder' }, 'pstack-verifier'), false);
});
