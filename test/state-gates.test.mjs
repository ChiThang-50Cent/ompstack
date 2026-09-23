import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../dist/src/domain.js';
import { evaluateCompletionGates } from '../dist/src/gates.js';
import { createInitialState, createRun, reduceState } from '../dist/src/state.js';
import { validateVerdict } from '../dist/src/validation.js';

const at = '2026-09-23T00:00:00.000Z';
const fp = digest => ({ kind: 'git', digest, generatedAt: at, headSha: 'abc', dirtyHash: digest, clean: false, partial: false, notes: [] });

function startedRun() {
  let state = createInitialState({ ...DEFAULT_CONFIG, defaultMode: 'auto' });
  const run = createRun({
    objective: 'repair behavior',
    playbook: 'bug-fix',
    ceremony: 'strict',
    verificationRequired: true,
    acceptance: [{ id: 'AC-1', text: 'Original reproduction succeeds' }],
    at,
  });
  run.baselineFingerprint = fp('old');
  run.lastKnownFingerprint = fp('new');
  state = reduceState(state, { type: 'start_run', run, at });
  return state;
}

test('open acceptance and missing verdict block completion', () => {
  const state = startedRun();
  const report = evaluateCompletionGates(state, fp('new'), DEFAULT_CONFIG, { ignoreRunStatus: true });
  assert.equal(report.allowed, false);
  assert.ok(report.issues.some(issue => issue.code === 'ACCEPTANCE_OPEN'));
  assert.ok(report.issues.some(issue => issue.code === 'VERDICT_MISSING'));
});

test('fresh independent evidence-backed PASS permits explicit completion', () => {
  let state = startedRun();
  state = reduceState(state, {
    type: 'record_evidence',
    evidence: { id: 'ev-1', kind: 'reproduction', claim: 'original path passes', ref: 'artifacts/repro.log', producedBy: 'verifier-1', createdAt: at, fingerprintDigest: 'new' },
    at,
  });
  state = reduceState(state, { type: 'update_acceptance', id: 'AC-1', state: 'passed', evidenceRefs: ['ev-1'], at });
  state = reduceState(state, {
    type: 'record_agent',
    agent: { actorId: 'writer-1', role: 'builder', agentName: 'pstack-builder', invocationKind: 'task', modelPatterns: ['@task'], status: 'completed', spawnedAt: at, completedAt: at },
    at,
  });
  state = reduceState(state, {
    type: 'record_agent',
    agent: { actorId: 'verifier-1', role: 'verifier', agentName: 'pstack-verifier', invocationKind: 'task', modelPatterns: ['@slow'], status: 'completed', spawnedAt: at, completedAt: at },
    at,
  });
  const verdict = {
    id: 'v-1', scope: 'final', verdict: 'PASS', verifierActorId: 'verifier-1', writerActorIds: ['writer-1'], evidenceRefs: ['ev-1'], testedFingerprint: fp('new'), observations: ['reproduction passes'], limitations: [], createdAt: at,
  };
  assert.deepEqual(validateVerdict(state.activeRun, verdict, DEFAULT_CONFIG), []);
  state = reduceState(state, { type: 'record_verdict', verdict, at });
  const report = evaluateCompletionGates(state, fp('new'), DEFAULT_CONFIG, { ignoreRunStatus: true });
  assert.equal(report.allowed, true, JSON.stringify(report.issues));
});

test('stale fingerprint, actor collision, missing evidence and pending worker block', () => {
  let state = startedRun();
  state = reduceState(state, { type: 'update_acceptance', id: 'AC-1', state: 'passed', evidenceRefs: [], at });
  state = reduceState(state, {
    type: 'record_agent',
    agent: { actorId: 'same', role: 'builder', agentName: 'pstack-builder', invocationKind: 'task', modelPatterns: [], status: 'spawned', spawnedAt: at },
    at,
  });
  state = reduceState(state, {
    type: 'record_verdict',
    verdict: { id: 'v-bad', scope: 'final', verdict: 'PASS', verifierActorId: 'same', writerActorIds: ['same'], evidenceRefs: [], testedFingerprint: fp('old'), observations: [], limitations: [], createdAt: at },
    at,
  });
  const codes = new Set(evaluateCompletionGates(state, fp('new'), DEFAULT_CONFIG, { ignoreRunStatus: true }).issues.map(issue => issue.code));
  for (const expected of ['PASS_WITHOUT_EVIDENCE', 'AGENT_PENDING', 'ACTOR_COLLISION', 'VERDICT_STALE']) assert.ok(codes.has(expected), expected);
});

test('INCONCLUSIVE verdict requires a limitation', () => {
  const state = startedRun();
  const verdict = { id: 'v-i', scope: 'final', verdict: 'INCONCLUSIVE', verifierActorId: 'v', writerActorIds: ['w'], evidenceRefs: [], testedFingerprint: fp('new'), observations: [], limitations: [], createdAt: at };
  assert.ok(validateVerdict(state.activeRun, verdict, DEFAULT_CONFIG).some(problem => problem.includes('limitation')));
});

test('verdict provenance requires recorded verifier and writer roles', () => {
  let state = startedRun();
  state = reduceState(state, {
    type: 'record_agent',
    agent: { actorId: 'not-a-verifier', role: 'reviewer', agentName: 'pstack-reviewer', invocationKind: 'task', modelPatterns: [], status: 'completed', spawnedAt: at },
    at,
  });
  const verdict = {
    id: 'v-role', scope: 'final', verdict: 'FAIL', verifierActorId: 'not-a-verifier', writerActorIds: ['missing-writer'], evidenceRefs: [], testedFingerprint: fp('new'), observations: [], limitations: [], createdAt: at,
  };
  const problems = validateVerdict(state.activeRun, verdict, DEFAULT_CONFIG).join('\n');
  assert.match(problems, /not 'verifier'/);
  assert.match(problems, /does not reference a recorded pstack actor/);
});


test('a verdict cannot be accepted from a verifier that has not completed', () => {
  let state = startedRun();
  state = reduceState(state, {
    type: 'record_agent',
    agent: { actorId: 'writer-1', role: 'builder', agentName: 'pstack-builder', invocationKind: 'task', modelPatterns: [], status: 'completed', spawnedAt: at, completedAt: at },
    at,
  });
  state = reduceState(state, {
    type: 'record_agent',
    agent: { actorId: 'verifier-running', role: 'verifier', agentName: 'pstack-verifier', invocationKind: 'task', modelPatterns: [], status: 'running', spawnedAt: at },
    at,
  });
  const verdict = {
    id: 'v-running', scope: 'final', verdict: 'FAIL', verifierActorId: 'verifier-running', writerActorIds: ['writer-1'], evidenceRefs: [], testedFingerprint: fp('new'), observations: [], limitations: [], createdAt: at,
  };
  assert.ok(validateVerdict(state.activeRun, verdict, DEFAULT_CONFIG).some(problem => problem.includes('not completed')));
  state = reduceState(state, { type: 'record_verdict', verdict, at });
  const codes = evaluateCompletionGates(state, fp('new'), DEFAULT_CONFIG, { ignoreRunStatus: true }).issues.map(issue => issue.code);
  assert.ok(codes.includes('VERIFIER_NOT_COMPLETED'));
});

test('waived required acceptance needs a reason', () => {
  let state = startedRun();
  state = reduceState(state, { type: 'update_acceptance', id: 'AC-1', state: 'waived', reason: '', at });
  const codes = evaluateCompletionGates(state, fp('new'), DEFAULT_CONFIG, { ignoreRunStatus: true }).issues.map(issue => issue.code);
  assert.ok(codes.includes('SKIP_REASON_MISSING'));
});
