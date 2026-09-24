import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskLifecycleTracker, parseTaskResultSummaries } from '../dist/src/task-lifecycle.js';

const OMP_18_3_WAIT_RESULT = [
  'Completed background task:',
  '<task-result id="scout1" agent="pstack-scout" status="completed" duration="120ms">',
  'Scout report is available.',
  '</task-result>',
].join('\n');

const OMP_18_2_HUB_WAIT_RESULT = [
  'hub wait completed:',
  '<task-result id="scout1" agent="pstack-scout" status="completed" duration="120ms">',
  'Scout report is available.',
  '</task-result>',
].join('\n');

function createHarness() {
  const actor = {
    actorId: 'scout1',
    role: 'scout',
    agentName: 'pstack-scout',
    invocationKind: 'task',
    modelPatterns: [],
    status: 'running',
    spawnedAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
  };
  const state = { activeRun: { agents: [actor] } };
  let mutations = 0;
  const store = {
    async get() {
      return { state };
    },
    async mutate(_ctx, action) {
      assert.equal(action.type, 'update_agent');
      mutations += 1;
      Object.assign(actor, action.patch);
      return { state };
    },
  };
  return { actor, state, store, getMutations: () => mutations };
}

test('parses wait result markers from both supported host envelopes', () => {
  for (const text of [OMP_18_3_WAIT_RESULT, OMP_18_2_HUB_WAIT_RESULT]) {
    assert.deepEqual(parseTaskResultSummaries(text), [{
      id: 'scout1',
      agentName: 'pstack-scout',
      status: 'completed',
    }]);
  }
});

test('reconciles wait and hub result markers, ignores unknown IDs, and is idempotent', async t => {
  for (const [label, text] of [
    ['OMP 18.3 wait', OMP_18_3_WAIT_RESULT],
    ['OMP 18.2 hub wait', OMP_18_2_HUB_WAIT_RESULT],
  ]) {
    await t.test(label, async () => {
      const harness = createHarness();
      const tracker = new TaskLifecycleTracker();
      const touched = await tracker.reconcileTaskResultText(text, {}, harness.store);
      assert.deepEqual(touched, ['scout1']);
      assert.equal(harness.actor.status, 'completed');
      assert.equal(harness.getMutations(), 1);

      const replay = await tracker.reconcileTaskResultText(text, {}, harness.store);
      assert.deepEqual(replay, []);
      assert.equal(harness.getMutations(), 1);
    });
  }

  await t.test('unknown marker ID is ignored', async () => {
    const harness = createHarness();
    const tracker = new TaskLifecycleTracker();
    const touched = await tracker.reconcileTaskResultText(
      '<task-result id="unknown-agent" agent="unknown" status="completed"></task-result>',
      {},
      harness.store,
    );
    assert.deepEqual(touched, []);
    assert.equal(harness.actor.status, 'running');
    assert.equal(harness.getMutations(), 0);
  });
});
