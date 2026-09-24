import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../dist/src/domain.js';
import { chooseModelPatterns, roleForAgent } from '../dist/src/model-routing.js';
import { createRun } from '../dist/src/state.js';

function context() {
  const models = new Map([
    ['@pstack_code', { id: 'code', provider: 'openai', family: 'openai' }],
    ['@task', { id: 'task', provider: 'openai', family: 'openai' }],
    ['@pstack_verify', { id: 'verify', provider: 'anthropic', family: 'anthropic' }],
    ['@slow', { id: 'slow', provider: 'openai', family: 'openai' }],
  ]);
  return { models: { resolve: spec => models.get(spec), family: model => model.family, list: () => [...models.values()], current: () => models.get('@task') } };
}

test('maps specialist agent names to roles', () => {
  assert.equal(roleForAgent('pstack-builder'), 'builder');
  assert.equal(roleForAgent('PSTACK-VERIFIER'), 'verifier');
  for (const agent of ['pstack-reviewer-a', 'pstack-reviewer-b', 'pstack-reviewer-c']) {
    assert.equal(roleForAgent(agent), 'reviewer');
  }
  assert.equal(roleForAgent('unknown'), undefined);
});

test('prefers a verifier from a different family than latest writer', () => {
  const run = createRun({ objective: 'x', playbook: 'feature', ceremony: 'strict', verificationRequired: true });
  run.agents.push({ actorId: 'w', role: 'builder', agentName: 'pstack-builder', invocationKind: 'task', modelPatterns: ['@pstack_code'], modelFamily: 'openai', status: 'completed', spawnedAt: 'x' });
  const result = chooseModelPatterns(context(), 'pstack-verifier', ['@slow', '@pstack_verify'], run, DEFAULT_CONFIG);
  assert.deepEqual(result.patterns, ['@pstack_verify', '@slow']);
  assert.equal(result.resolvedFamily, 'anthropic');
  assert.match(result.note, /away from writer family/);
});

test('non-verifier spawns keep OMP model selection', () => {
  const run = createRun({ objective: 'x', playbook: 'feature', ceremony: 'strict', verificationRequired: true });
  assert.deepEqual(chooseModelPatterns(context(), 'pstack-builder', ['@task'], run, DEFAULT_CONFIG), {});
});
