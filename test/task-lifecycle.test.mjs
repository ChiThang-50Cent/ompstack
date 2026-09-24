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

function asyncResultEntry(jobId, { timestamp = '2026-01-01T00:00:05.000Z', schemaStatus = 'valid' } = {}) {
  return {
    type: 'custom_message', id: `e-${jobId}`, parentId: null, timestamp, customType: 'async-result',
    content: `<system-notice>Background job ${jobId} has completed.</system-notice>`, display: true, attribution: 'agent',
    details: { jobs: [{ jobId, type: 'task', label: jobId, ...(schemaStatus ? { schema: { status: schemaStatus } } : {}) }] },
  };
}

function reconcileCtx(branch, snapshot = { running: [], recent: [] }) {
  return { getAsyncJobSnapshot: () => snapshot, sessionManager: { getBranch: () => branch } };
}

test('a delivered async-result notice settles an actor whose wait was skipped (no job or runtime id)', async () => {
  const { actor, store, getMutations } = createHarness();
  actor.spawnKey = 'scout1';
  const tracker = new TaskLifecycleTracker();
  assert.deepEqual(await tracker.reconcile(reconcileCtx([asyncResultEntry('scout1')]), store), ['scout1']);
  assert.equal(actor.status, 'completed');
  assert.match(actor.lifecycleNote, /async-result delivery/);
  assert.deepEqual(await tracker.reconcile(reconcileCtx([asyncResultEntry('scout1')]), store), [], 'idempotent');
  assert.equal(getMutations(), 1);
});

test('delivery rows: schema-invalid fails the actor; older notices and ambiguous spawn keys are ignored', async () => {
  const invalid = createHarness();
  invalid.actor.jobId = 'scout1';
  await new TaskLifecycleTracker().reconcile(reconcileCtx([asyncResultEntry('scout1', { schemaStatus: 'invalid' })]), invalid.store);
  assert.equal(invalid.actor.status, 'failed');

  const stale = createHarness();
  stale.actor.jobId = 'scout1';
  stale.actor.spawnedAt = '2026-01-02T00:00:00.000Z';
  await new TaskLifecycleTracker().reconcile(reconcileCtx([asyncResultEntry('scout1')]), stale.store);
  assert.equal(stale.actor.status, 'running', 'a notice from before this spawn belongs to an earlier job with the same id');

  const ambiguous = createHarness();
  ambiguous.actor.spawnKey = 'scout1';
  ambiguous.state.activeRun.agents.push({ ...ambiguous.actor, actorId: 'scout1-b' });
  await new TaskLifecycleTracker().reconcile(reconcileCtx([asyncResultEntry('scout1')]), ambiguous.store);
  assert.equal(ambiguous.actor.status, 'running', 'two open actors share the spawn key: no guess');
});

test('a capped snapshot recent row still matches by spawn key when the actor has no ids', async () => {
  const { actor, store } = createHarness();
  actor.spawnKey = 'scout1';
  await new TaskLifecycleTracker().reconcile(reconcileCtx([], { running: [], recent: [{ id: 'scout1', agentId: 'scout1', status: 'completed', type: 'task' }] }), store);
  assert.equal(actor.status, 'completed');
  assert.match(actor.lifecycleNote, /async job snapshot/);
});
