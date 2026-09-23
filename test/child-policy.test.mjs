import test from 'node:test';
import assert from 'node:assert/strict';
import { enforcePstackChildToolPolicy } from '../dist/src/child-policy.js';

function session(entries) {
  return {
    cwd: process.cwd(),
    sessionManager: {
      getEntries: () => entries,
      getBranch: () => entries,
      getSessionFile: () => undefined,
    },
  };
}

function child(agent) {
  return session([{ type: 'session_init', task: 'bounded child task', agent, tools: ['read'] }]);
}

test('pstack child cannot touch parent gate state or hub; OMP owns the rest of admission', () => {
  const ctx = child('pstack-verifier');
  for (const toolName of ['pstack_verdict', 'hub']) {
    assert.equal(enforcePstackChildToolPolicy({ toolName }, ctx).result?.block, true, toolName);
  }
  for (const toolName of ['read', 'bash', 'write', 'edit', 'task']) {
    assert.deepEqual(enforcePstackChildToolPolicy({ toolName }, ctx), { handled: true }, toolName);
  }
});

test('non-pstack child may use hub but not pstack_* tools', () => {
  const ctx = child('probe-child');
  assert.deepEqual(enforcePstackChildToolPolicy({ toolName: 'hub' }, ctx), { handled: true });
  assert.equal(enforcePstackChildToolPolicy({ toolName: 'pstack_evidence' }, ctx).result?.block, true);
});

test('unreadable session is unknown: pstack_* blocked, not treated as main', () => {
  const ctx = { cwd: process.cwd(), sessionManager: { getEntries: () => { throw new Error('x'); }, getBranch: () => { throw new Error('x'); } } };
  assert.equal(enforcePstackChildToolPolicy({ toolName: 'pstack_status' }, ctx).result?.block, true);
  assert.deepEqual(enforcePstackChildToolPolicy({ toolName: 'write' }, ctx), { handled: true });
});

test('main session stays on the parent hook path', () => {
  assert.deepEqual(enforcePstackChildToolPolicy({ toolName: 'write' }, session([])), { handled: false });
});
