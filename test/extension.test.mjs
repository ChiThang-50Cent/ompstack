import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pstackExtension from '../dist/src/index.js';

function createMock(cwd) {
  const hooks = new Map();
  const tools = new Map();
  const commands = new Map();
  const flags = new Map();
  const branch = [];
  const notices = [];
  const statuses = new Map();
  let asyncSnapshot = null;
  const models = new Map([
    ['@pstack_fast', { id: 'fast', provider: 'openai', family: 'openai' }],
    ['@smol', { id: 'smol', provider: 'openai', family: 'openai' }],
    ['@pstack_code', { id: 'code', provider: 'openai', family: 'openai' }],
    ['@task', { id: 'task', provider: 'openai', family: 'openai' }],
    ['@pstack_reason', { id: 'reason', provider: 'openai', family: 'openai' }],
    ['@pstack_review', { id: 'review', provider: 'anthropic', family: 'anthropic' }],
    ['@pstack_verify', { id: 'verify', provider: 'anthropic', family: 'anthropic' }],
    ['@slow', { id: 'slow', provider: 'openai', family: 'openai' }],
  ]);
  const typebox = { Type: {
    Object: (properties, options) => ({ kind: 'object', properties, options }),
    String: () => ({ kind: 'string' }), Boolean: () => ({ kind: 'boolean' }),
    Literal: value => ({ kind: 'literal', value }), Union: values => ({ kind: 'union', values }),
    Optional: schema => ({ kind: 'optional', schema }), Array: schema => ({ kind: 'array', schema }),
  } };
  const api = {
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    typebox,
    on(name, handler) { hooks.set(name, [...(hooks.get(name) ?? []), handler]); },
    registerTool(tool) { tools.set(tool.name, tool); },
    registerCommand(name, command) { commands.set(name, command); },
    registerFlag(name, options) { flags.set(name, options.default); },
    getFlag(name) { return flags.get(name); },
    getAllTools() { return [...tools.keys()].map(name => ({ name })); },
    appendEntry(customType, data) { branch.push({ type: 'custom', customType, data }); },
    async exec(command, args, options = {}) {
      try {
        return { stdout: execFileSync(command, args, { cwd: options.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), stderr: '', code: 0 };
      } catch (error) {
        return { stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? ''), code: error.status ?? 1 };
      }
    },
  };
  const ctx = {
    cwd, hasUI: true, mode: 'tui',
    ui: { notify(message, type = 'info') { notices.push({ message, type }); }, setStatus(key, value) { statuses.set(key, value); } },
    sessionManager: {
      getSessionId: () => 'session-1',
      getBranch: () => branch,
      getEntries: () => branch,
      getHeader: () => ({ type: 'session', id: 'session-1', cwd }),
      getSessionFile: () => path.join(cwd, 'session.jsonl'),
    },
    models: { list: () => [...models.values()], current: () => models.get('@task'), resolve: spec => models.get(spec), family: model => model.family },
    getAsyncJobSnapshot: () => asyncSnapshot,
  };
  async function emit(name, event = {}) {
    let result;
    for (const handler of hooks.get(name) ?? []) {
      const candidate = await handler(event, ctx);
      if (candidate !== undefined) result = candidate;
    }
    return result;
  }
  return { api, ctx, emit, hooks, tools, commands, flags, branch, notices, statuses, setAsyncSnapshot(value) { asyncSnapshot = value; } };
}

async function execute(tool, params, ctx) {
  return tool.execute('call-1', params, undefined, undefined, ctx);
}

test('extension registers complete surface and enforces an end-to-end run', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const mock = createMock(cwd);
  pstackExtension(mock.api);
  mock.flags.set('pstack-mode', 'auto');
  assert.equal(mock.tools.size, 7);
  assert.ok(mock.commands.has('pstack'));
  assert.ok(mock.hooks.has('before_subagent_spawn'));
  assert.ok(mock.hooks.has('session_stop'));

  await mock.emit('session_start');
  assert.equal(mock.statuses.size, 0, 'pstack does not publish a raw hook-status row');
  const runTool = mock.tools.get('pstack_gate');
  const start = await execute(runTool, {
    action: 'init', objective: 'Fix the reset flow bug', playbook: 'bug-fix', ceremony: 'strict', verificationRequired: true,
    acceptance: [{ id: 'AC-1', text: 'Original reset reproduction succeeds' }],
  }, mock.ctx);
  assert.equal(start.isError, undefined);

  const policy = await mock.emit('before_agent_start', { prompt: 'continue the fix', systemPrompt: ['base'] });
  assert.equal(policy.systemPrompt[0], 'base');
  assert.match(policy.systemPrompt.at(-1), /Active run:/);

  const rewritten = await mock.emit('tool_call', { toolCallId: 'task-build-1', toolName: 'task', input: { agent: 'pstack-builder', task: 'Implement bounded fix', isolated: false } });
  assert.equal(rewritten.input.isolated, false, 'pstack never rewrites isolation; OMP owns it');
  assert.equal(rewritten.input.schemaMode, 'strict');

  const builderRoute = await mock.emit('before_subagent_spawn', { agent: 'pstack-builder', invocationKind: 'task', patterns: ['@task'], spawnKey: 'writer-1' });
  assert.equal(builderRoute?.model, undefined, 'builder keeps OMP model selection');
  await mock.emit('tool_result', { toolCallId: 'task-build-1', toolName: 'task', isError: false, input: { agent: 'pstack-builder', task: 'Implement bounded fix', isolated: false }, details: { results: [{ id: 'runtime-writer-1', agent: 'pstack-builder', status: 'completed' }] } });

  assert.ok(mock.notices.some(n => n.type === 'warning' && /isolated/.test(n.message)), 'non-isolated writer is warned, not rewritten');
  assert.equal(await mock.emit('session_stop'), undefined, 'default: stop on the first attempt instead of looping');
  assert.ok(mock.notices.some(n => n.type === 'warning' && /ACCEPTANCE_OPEN/.test(n.message)), 'open gates are reported');
  assert.equal(latestRun(mock).status, 'active', 'stopping never passes a gate');

  const verifierCall = await mock.emit('tool_call', { toolCallId: 'task-verify-1', toolName: 'task', input: { agent: 'pstack-verifier', task: 'Verify final behavior' } });
  assert.match(verifierCall.input.task, /Target fingerprint:/);
  assert.match(verifierCall.input.task, /writer-1/);
  const verifierRoute = await mock.emit('before_subagent_spawn', { agent: 'pstack-verifier', invocationKind: 'task', patterns: ['@slow', '@pstack_verify'], spawnKey: 'verifier-1' });
  assert.equal(verifierRoute.model[0], '@pstack_verify');

  const fpResult = await execute(mock.tools.get('pstack_fingerprint'), {}, mock.ctx);
  const fingerprint = fpResult.details;
  const verifierResult = {
    toolCallId: 'task-verify-1', toolName: 'task', isError: false,
    details: { results: [{
      id: 'runtime-verifier-1', agent: 'pstack-verifier', exitCode: 0,
      structuredOutput: { source: 'agent', status: 'valid', data: {
        verdict: 'PASS', scope: 'final',
        tested_fingerprint: { kind: fingerprint.kind, digest: fingerprint.digest, partial: fingerprint.partial, head_sha: fingerprint.headSha ?? '' },
        surface: 'original reset reproduction', observations: ['reset flow succeeds'],
        evidence: [{ kind: 'reproduction', claim: 'original reset flow succeeds', ref: 'artifacts/reset-repro.log' }],
        limitations: [],
        acceptance_results: [{ id: 'AC-1', outcome: 'passed', evidence_refs: ['artifacts/reset-repro.log'] }],
      } },
    }] },
  };
  await mock.emit('tool_result', verifierResult);
  // OMP may replay/re-render a settled task result. Ingestion must be idempotent.
  await mock.emit('tool_result', verifierResult);

  const ingested = [...mock.branch].reverse().find(entry => entry.customType === 'pstack-omp/state-v2').data.activeRun;
  assert.equal(ingested.evidence.length, 1);
  assert.equal(ingested.verdicts.length, 1);
  assert.equal(ingested.verdicts[0].verdict, 'PASS');
  assert.equal(ingested.acceptance[0].state, 'passed');

  const complete = await execute(runTool, { action: 'check' }, mock.ctx);
  assert.equal(complete.isError, undefined, complete.content[0].text);
  assert.match(complete.content[0].text, /all gates passed/i);
  const finalStop = await mock.emit('session_stop');
  assert.equal(finalStop, undefined);
});

test('pstack defaults off and restores explicit mode from session entries', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-mode-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const first = createMock(cwd);
  pstackExtension(first.api);
  await first.emit('session_start');

  const initial = await execute(first.tools.get('pstack_status'), {}, first.ctx);
  assert.equal(initial.details.state.mode, 'off');
  assert.equal(await first.emit('before_agent_start', { prompt: 'normal work', systemPrompt: ['base'] }), undefined);

  await first.commands.get('pstack').handler('auto', first.ctx);
  const selected = await execute(first.tools.get('pstack_status'), {}, first.ctx);
  assert.equal(selected.details.state.mode, 'auto');

  await first.commands.get('pstack').handler('', first.ctx);
  assert.ok(first.notices.some(notice => /Pstack mode: auto/.test(notice.message)));
  assert.equal(first.statuses.size, 0);

  await first.emit('session_shutdown');
  await first.emit('session_start');
  const resumed = await execute(first.tools.get('pstack_status'), {}, first.ctx);
  assert.equal(resumed.details.state.mode, 'auto');

  const restored = createMock(cwd);
  restored.branch.push(...first.branch);
  pstackExtension(restored.api);
  await restored.emit('session_start');
  const restoredStatus = await execute(restored.tools.get('pstack_status'), {}, restored.ctx);
  assert.equal(restoredStatus.details.state.mode, 'auto');

  const fresh = createMock(cwd);
  pstackExtension(fresh.api);
  await fresh.emit('session_start');
  const freshStatus = await execute(fresh.tools.get('pstack_status'), {}, fresh.ctx);
  assert.equal(freshStatus.details.state.mode, 'off');
});

test('subagent-bound extension instance does not inject or mutate parent pstack policy', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-child-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const mock = createMock(cwd);
  mock.branch.push({ type: 'session_init', task: 'Verify the parent artifact', agent: 'pstack-verifier', tools: ['read', 'bash'] });
  pstackExtension(mock.api);
  await mock.emit('session_start');

  assert.equal(await mock.emit('before_agent_start', { prompt: 'child work', systemPrompt: ['child-base'] }), undefined);
  const hub = await mock.emit('tool_call', { toolCallId: 'child-hub', toolName: 'hub', input: { op: 'send' } });
  assert.equal(hub.block, true);
  assert.match(hub.reason, /parent coordinator/);
  assert.equal(await mock.emit('session_stop'), undefined);
  assert.equal(mock.branch.some(entry => entry.customType === 'pstack-omp/state-v2'), false);
});

test('a PASS for a stale fingerprint is ingested as INCONCLUSIVE and cannot pass acceptance', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-stale-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(path.join(cwd, 'artifact.txt'), 'before\n');
  const mock = createMock(cwd);
  pstackExtension(mock.api);
  mock.flags.set('pstack-mode', 'auto');
  await mock.emit('session_start');
  await execute(mock.tools.get('pstack_gate'), {
    action: 'init', objective: 'Verify an artifact-bound change', playbook: 'feature', ceremony: 'strict', verificationRequired: true,
    acceptance: [{ id: 'AC-1', text: 'Artifact behavior is correct' }],
  }, mock.ctx);

  await mock.emit('tool_call', { toolCallId: 'verify-stale-call', toolName: 'task', input: { agent: 'pstack-verifier', task: 'Verify' } });
  await mock.emit('before_subagent_spawn', { agent: 'pstack-verifier', invocationKind: 'task', patterns: ['@slow'], spawnKey: 'verifier-stale' });
  const tested = (await execute(mock.tools.get('pstack_fingerprint'), {}, mock.ctx)).details;
  await writeFile(path.join(cwd, 'artifact.txt'), 'after\n');

  await mock.emit('tool_result', {
    toolCallId: 'verify-stale-call', toolName: 'task', isError: false,
    details: { results: [{
      id: 'runtime-verifier-stale', agent: 'pstack-verifier', exitCode: 0,
      structuredOutput: { source: 'agent', status: 'valid', data: {
        verdict: 'PASS', scope: 'final',
        tested_fingerprint: { kind: tested.kind, digest: tested.digest, partial: tested.partial },
        surface: 'artifact file', observations: ['old artifact looked correct'],
        evidence: [{ kind: 'observation', claim: 'old artifact inspected', ref: 'artifacts/old-inspection.log' }],
        limitations: [],
        acceptance_results: [{ id: 'AC-1', outcome: 'passed', evidence_refs: ['artifacts/old-inspection.log'] }],
      } },
    }] },
  });

  const state = [...mock.branch].reverse().find(entry => entry.customType === 'pstack-omp/state-v2').data.activeRun;
  assert.equal(state.verdicts.at(-1).verdict, 'INCONCLUSIVE');
  assert.match(state.verdicts.at(-1).limitations.join('\n'), /current artifact/i);
  assert.equal(state.acceptance[0].state, 'open');
  const complete = await execute(mock.tools.get('pstack_gate'), { action: 'check' }, mock.ctx);
  assert.equal(complete.isError, true);
  assert.match(complete.content[0].text, /VERDICT_INCONCLUSIVE/);
});

test('strict mode blocks verifier spawn without an active run', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-strict-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const mock = createMock(cwd);
  pstackExtension(mock.api);
  await mock.emit('session_start');
  await mock.commands.get('pstack').handler('strict', mock.ctx);
  const result = await mock.emit('before_subagent_spawn', { agent: 'pstack-verifier', invocationKind: 'task', patterns: ['@slow'] });
  assert.equal(result.block, true);
  assert.match(result.reason, /active run/);
});

test('doctor reports model resolution for every pstack agent', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-doctor-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const mock = createMock(cwd);
  pstackExtension(mock.api);
  await mock.emit('session_start');
  await mock.commands.get('pstack').handler('doctor', mock.ctx);
  const message = mock.notices.at(-1)?.message ?? '';
  for (const agent of ['pstack-scout', 'pstack-architect', 'pstack-builder', 'pstack-reviewer', 'pstack-reviewer-a', 'pstack-reviewer-b', 'pstack-reviewer-c', 'pstack-comment-sicko', 'pstack-judge', 'pstack-judge-b', 'pstack-synthesizer', 'pstack-verifier']) {
    assert.match(message, new RegExp(`${agent}:`));
  }
  assert.match(message, /pstack-builder: .*@smol=/);
});


test('non-isolated writer warning is persisted as an audit checkpoint', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-writer-warning-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const mock = createMock(cwd);
  pstackExtension(mock.api);
  mock.flags.set('pstack-mode', 'auto');
  await mock.emit('session_start');
  await execute(mock.tools.get('pstack_gate'), {
    action: 'init',
    objective: 'Record writer isolation',
    playbook: 'feature',
    ceremony: 'standard',
    verificationRequired: false,
  }, mock.ctx);

  await mock.emit('tool_result', {
    toolCallId: 'writer-warning-1',
    toolName: 'task',
    isError: false,
    input: { tasks: [{ agent: 'pstack-builder', isolated: false }] },
    details: { results: [] },
  });

  const runId = latestRun(mock).id;
  const events = (await readFile(path.join(cwd, '.omp/pstack/runs', runId, 'events.jsonl'), 'utf8'))
    .trim().split('\n').map(line => JSON.parse(line));
  const checkpoint = events.find(event => event.type === 'writer_not_isolated');
  assert.deepEqual(checkpoint?.data, { agents: ['pstack-builder'] });
});


test('async task remains pending until the OMP job snapshot reports a terminal state', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-async-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const mock = createMock(cwd);
  pstackExtension(mock.api);
  mock.flags.set('pstack-mode', 'auto');
  await mock.emit('session_start');
  const runTool = mock.tools.get('pstack_gate');
  await execute(runTool, {
    action: 'init', objective: 'Apply a bounded async change', playbook: 'feature', ceremony: 'standard', verificationRequired: false,
  }, mock.ctx);

  await mock.emit('tool_call', {
    toolCallId: 'async-call-1', toolName: 'task', input: { agent: 'pstack-builder', task: 'Implement the bounded change' },
  });
  await mock.emit('before_subagent_spawn', {
    agent: 'pstack-builder', invocationKind: 'task', patterns: ['@task'], spawnKey: 'writer-async',
  });
  await mock.emit('tool_result', {
    toolCallId: 'async-call-1', toolName: 'task', isError: false,
    details: {
      progress: [{ id: 'runtime-async-writer', agent: 'pstack-builder', status: 'running' }],
      async: { state: 'running', jobId: 'job-async-writer' },
    },
  });

  const premature = await execute(runTool, { action: 'check' }, mock.ctx);
  assert.equal(premature.isError, true);
  assert.match(premature.content[0].text, /AGENT_PENDING/);

  mock.setAsyncSnapshot({
    running: [],
    recent: [{ id: 'job-async-writer', agentId: 'runtime-async-writer', status: 'completed', type: 'task' }],
  });
  await mock.emit('before_agent_start', { prompt: 'continue', systemPrompt: [] });
  const complete = await execute(runTool, { action: 'check' }, mock.ctx);
  assert.equal(complete.isError, undefined, complete.content[0].text);
});

test('concurrent task calls are correlated by toolCallId and agent occurrence', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-concurrent-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const mock = createMock(cwd);
  pstackExtension(mock.api);
  mock.flags.set('pstack-mode', 'auto');
  await mock.emit('session_start');
  const runTool = mock.tools.get('pstack_gate');
  await execute(runTool, {
    action: 'init', objective: 'Build and review two bounded work items', playbook: 'feature', ceremony: 'standard', verificationRequired: false,
  }, mock.ctx);

  await mock.emit('tool_call', { toolCallId: 'call-builder', toolName: 'task', input: { agent: 'pstack-builder', task: 'Build' } });
  await mock.emit('tool_call', { toolCallId: 'call-reviewer', toolName: 'task', input: { agent: 'pstack-reviewer', task: 'Review' } });
  await mock.emit('before_subagent_spawn', { agent: 'pstack-builder', invocationKind: 'task', patterns: ['@task'], spawnKey: 'writer-concurrent' });
  await mock.emit('before_subagent_spawn', { agent: 'pstack-reviewer', invocationKind: 'task', patterns: ['@task'], spawnKey: 'reviewer-concurrent' });

  await mock.emit('tool_result', {
    toolCallId: 'call-reviewer', toolName: 'task', isError: false,
    details: { progress: [{ id: 'runtime-reviewer', agent: 'pstack-reviewer', status: 'running' }], async: { state: 'running', jobId: 'job-reviewer' } },
  });
  await mock.emit('tool_result', {
    toolCallId: 'call-builder', toolName: 'task', isError: false,
    details: { results: [{ id: 'runtime-builder', agent: 'pstack-builder', status: 'completed' }] },
  });

  const latest = [...mock.branch].reverse().find(entry => entry.customType === 'pstack-omp/state-v2').data.activeRun;
  const builder = latest.agents.find(agent => agent.actorId === 'writer-concurrent');
  const reviewer = latest.agents.find(agent => agent.actorId === 'reviewer-concurrent');
  assert.equal(builder.toolCallId, 'call-builder');
  assert.equal(builder.status, 'completed');
  assert.equal(reviewer.toolCallId, 'call-reviewer');
  assert.equal(reviewer.status, 'running');
});

function goalEntry(mode, status, id = 'goal-1') {
  return { type: 'mode_change', mode, data: { goal: { id, objective: 'Fix reset', status, tokensUsed: 0, timeUsedSeconds: 0, createdAt: 1, updatedAt: 1 } } };
}

function latestRun(mock) {
  return [...mock.branch].reverse().find(entry => entry.customType?.startsWith('pstack-omp/state-')).data.activeRun;
}

test('goal op=complete is refused while gates are open; OMP goal outcome drives run end state', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-goal-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const mock = createMock(cwd);
  mock.branch.push(goalEntry('goal', 'active'));
  pstackExtension(mock.api);
  mock.flags.set('pstack-mode', 'auto');
  await mock.emit('session_start');
  await execute(mock.tools.get('pstack_gate'), {
    action: 'init', objective: 'Fix reset', playbook: 'bug-fix', ceremony: 'standard', verificationRequired: false,
    acceptance: [{ id: 'AC-1', text: 'reset works' }],
  }, mock.ctx);
  assert.equal(latestRun(mock).goalRef, 'goal-1');

  const refused = await mock.emit('tool_call', { toolCallId: 'g1', toolName: 'goal', input: { op: 'complete' } });
  assert.equal(refused.block, true);
  assert.match(refused.reason, /ACCEPTANCE_OPEN/);
  assert.equal(await mock.emit('tool_call', { toolCallId: 'g0', toolName: 'goal', input: { op: 'get' } }), undefined);

  assert.equal(await mock.emit('session_stop'), undefined, 'live goal: OMP goal continuation owns the loop, no double block');
  mock.branch.push(goalEntry('goal_paused', 'paused'));
  assert.equal(await mock.emit('session_stop'), undefined, 'paused goal is an OMP-owned stop');
  mock.branch.push({ type: 'mode_change', mode: 'none' });
  assert.equal(await mock.emit('session_stop'), undefined, 'without a live goal the run is gate-only and stops at once by default');
  mock.branch.push(goalEntry('goal', 'active'));

  await execute(mock.tools.get('pstack_acceptance'), { action: 'update', id: 'AC-1', state: 'waived', reason: 'covered upstream' }, mock.ctx);
  const checked = await execute(mock.tools.get('pstack_gate'), { action: 'check' }, mock.ctx);
  assert.match(checked.content[0].text, /goal op=complete/);
  assert.equal(latestRun(mock).status, 'active', 'check never closes a goal-bound run; OMP goal completion does');
  assert.equal(await mock.emit('tool_call', { toolCallId: 'g2', toolName: 'goal', input: { op: 'complete' } }), undefined);
  await mock.emit('goal_updated', { type: 'goal_updated', goal: { id: 'other-goal', objective: 'x', status: 'complete' } });
  assert.equal(latestRun(mock).status !== 'done', true, 'unrelated goal does not close the run');
  await mock.emit('goal_updated', { type: 'goal_updated', goal: { id: 'goal-1', objective: 'Fix reset', status: 'complete' } });
  assert.equal(latestRun(mock).status, 'done');
});

test('dropping the bound OMP goal fails the run', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-goal-drop-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const mock = createMock(cwd);
  pstackExtension(mock.api);
  mock.flags.set('pstack-mode', 'auto');
  await mock.emit('session_start');
  await execute(mock.tools.get('pstack_gate'), { action: 'init', objective: 'Fix reset', playbook: 'bug-fix', ceremony: 'standard' }, mock.ctx);
  assert.equal(latestRun(mock).goalRef, undefined);
  await mock.emit('goal_updated', { type: 'goal_updated', goal: { id: 'goal-9', objective: 'Fix reset', status: 'active' } });
  assert.equal(latestRun(mock).goalRef, 'goal-9', 'a goal created after the run binds on first update');
  await mock.emit('goal_updated', { type: 'goal_updated', goal: { id: 'goal-9', objective: 'Fix reset', status: 'dropped' } });
  assert.equal(latestRun(mock).status, 'failed');
});

test('maxStopGateBlocks bounds session_stop blocks, then lets the session end', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-stopcap-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(path.join(cwd, 'pstack.json'), JSON.stringify({ maxStopGateBlocks: 1 }));
  const mock = createMock(cwd);
  pstackExtension(mock.api);
  mock.flags.set('pstack-mode', 'auto');
  await mock.emit('session_start');
  await execute(mock.tools.get('pstack_gate'), {
    action: 'init', objective: 'Fix reset', playbook: 'bug-fix', ceremony: 'standard', verificationRequired: false,
    acceptance: [{ id: 'AC-1', text: 'reset works' }],
  }, mock.ctx);
  const first = await mock.emit('session_stop');
  assert.equal(first.decision, 'block');
  assert.match(first.reason, /ACCEPTANCE_OPEN/);
  assert.equal(await mock.emit('session_stop'), undefined, 'second stop is released');
  assert.equal(latestRun(mock).status, 'active');
  assert.equal((await execute(mock.tools.get('pstack_gate'), { action: 'check' }, mock.ctx)).isError, true, 'gate still refuses after the stop');
});

function fakeProcess() {
  const proc = { stderrText: '', exits: [], exitCode: undefined };
  proc.stderr = { write(chunk) { proc.stderrText += chunk; return true; } };
  proc.exit = code => { proc.exits.push(code); return undefined; };
  return proc;
}

async function headlessRun(t, { mode, config, acceptance = [{ id: 'AC-1', text: 'reset works' }] }) {
  const { setHeadlessProcessForTests } = await import('../dist/src/headless.js');
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-headless-'));
  const proc = fakeProcess();
  setHeadlessProcessForTests(proc);
  t.after(async () => { setHeadlessProcessForTests(undefined); await rm(cwd, { recursive: true, force: true }); });
  if (config) await writeFile(path.join(cwd, 'pstack.json'), JSON.stringify(config));
  const mock = createMock(cwd);
  mock.ctx.hasUI = false;
  pstackExtension(mock.api);
  mock.flags.set('pstack-mode', mode);
  await mock.emit('session_start');
  await execute(mock.tools.get('pstack_gate'), {
    action: 'init', objective: 'Fix reset', playbook: 'bug-fix', ceremony: 'strict', verificationRequired: false, acceptance,
  }, mock.ctx);
  return { mock, proc, cwd };
}

test('strict gate-only runs block the stop twice by default, auto never does', async t => {
  const strict = await headlessRun(t, { mode: 'strict' });
  assert.equal((await strict.mock.emit('session_stop'))?.decision, 'block');
  assert.equal((await strict.mock.emit('session_stop'))?.decision, 'block');
  assert.equal(await strict.mock.emit('session_stop'), undefined, 'third stop is released');
  assert.equal(strict.mock.notices.length, 0, 'headless sessions do not rely on invisible UI notices');

  const auto = await headlessRun(t, { mode: 'auto' });
  assert.equal(await auto.mock.emit('session_stop'), undefined, 'auto keeps the 0-block default');

  const explicit = await headlessRun(t, { mode: 'strict', config: { maxStopGateBlocks: 0 } });
  assert.equal(await explicit.mock.emit('session_stop'), undefined, 'explicit 0 overrides the strict default');
});

test('headless shutdown with open gates reports on stderr and turns a clean exit non-zero', async t => {
  const { mock, proc, cwd } = await headlessRun(t, { mode: 'strict' });
  await mock.emit('session_shutdown');
  assert.match(proc.stderrText, /headless session ended with run run-/);
  assert.match(proc.stderrText, /ACCEPTANCE_OPEN/);
  assert.match(proc.stderrText, /Exit status 3/);
  assert.equal(proc.exitCode, 3);
  proc.exit(0);
  proc.exit(1);
  assert.deepEqual(proc.exits, [3, 1], 'a clean 0 becomes 3; OMP failures pass through');
  const events = await readFile(path.join(cwd, '.omp/pstack/runs', latestRun(mock).id, 'events.jsonl'), 'utf8');
  assert.match(events, /"type":"headless_open_gates"/);
});

test('headless shutdown leaves the exit alone when disabled, gates pass, or a UI is attached', async t => {
  const disabled = await headlessRun(t, { mode: 'strict', config: { headlessOpenGateExitCode: 0 } });
  await disabled.mock.emit('session_shutdown');
  assert.match(disabled.proc.stderrText, /Exit status unchanged/);
  assert.equal(disabled.proc.exitCode, undefined);

  const passing = await headlessRun(t, { mode: 'strict', acceptance: [] });
  await passing.mock.emit('session_shutdown');
  assert.match(passing.proc.stderrText, /never closed with pstack_gate action=check/);
  assert.equal(passing.proc.exitCode, undefined, 'passing-but-unclosed gates do not fail the process');

  const ui = await headlessRun(t, { mode: 'strict' });
  ui.mock.ctx.hasUI = true;
  await ui.mock.emit('session_shutdown');
  assert.equal(ui.proc.stderrText, '');
  assert.equal(ui.proc.exitCode, undefined);
});

async function gitWorkspace(t, mode, { headless = false, config } = {}) {
  const { setHeadlessProcessForTests } = await import('../dist/src/headless.js');
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-ext-tripwire-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  await writeFile(path.join(cwd, 'app.js'), 'export const a = 1;\n');
  git('add', '.'); git('commit', '-qm', 'init');
  if (config) await writeFile(path.join(cwd, 'pstack.json'), JSON.stringify(config));
  const proc = fakeProcess();
  setHeadlessProcessForTests(proc);
  t.after(async () => { setHeadlessProcessForTests(undefined); await rm(cwd, { recursive: true, force: true }); });
  const mock = createMock(cwd);
  mock.ctx.hasUI = !headless;
  pstackExtension(mock.api);
  mock.flags.set('pstack-mode', mode);
  await mock.emit('session_start');
  return { cwd, mock, proc };
}

const bigChange = cwd => Promise.all([
  writeFile(path.join(cwd, 'app.js'), 'export const a = 2;\n'),
  writeFile(path.join(cwd, 'lib.js'), Array.from({ length: 30 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n'),
]);

test('strict blocks direct file writes until a run is open, unless the prompt routed direct', async t => {
  const { mock } = await gitWorkspace(t, 'strict');
  await mock.emit('before_agent_start', { prompt: 'the sidebar lags when I scroll', systemPrompt: ['base'] });
  const blocked = await mock.emit('tool_call', { toolCallId: 'w1', toolName: 'edit', input: { path: 'app.js' } });
  assert.equal(blocked?.block, true);
  assert.match(blocked.reason, /open a run before editing/);
  assert.equal(await mock.emit('tool_call', { toolCallId: 'r1', toolName: 'read', input: { path: 'app.js' } }), undefined, 'reads are never blocked');

  await execute(mock.tools.get('pstack_gate'), { action: 'init', objective: 'Fix lag', playbook: 'performance', ceremony: 'standard', verificationRequired: false, acceptance: [{ id: 'AC-1', text: 'no lag' }] }, mock.ctx);
  assert.equal(await mock.emit('tool_call', { toolCallId: 'w2', toolName: 'write', input: { path: 'app.js' } }), undefined, 'writes pass once a run is open');

  const direct = await gitWorkspace(t, 'strict');
  await direct.mock.emit('before_agent_start', { prompt: 'rename this variable', systemPrompt: ['base'] });
  assert.equal(await direct.mock.emit('tool_call', { toolCallId: 'w3', toolName: 'edit', input: {} }), undefined, 'router-direct prompts may edit without a run');

  const auto = await gitWorkspace(t, 'auto');
  await auto.mock.emit('before_agent_start', { prompt: 'the sidebar lags when I scroll', systemPrompt: ['base'] });
  assert.equal(await auto.mock.emit('tool_call', { toolCallId: 'w4', toolName: 'edit', input: {} }), undefined, 'auto never blocks writes');
});

test('strict blocks the stop twice when the session changed more than the direct budget without a run', async t => {
  const { cwd, mock } = await gitWorkspace(t, 'strict');
  await bigChange(cwd);
  const first = await mock.emit('session_stop');
  assert.equal(first?.decision, 'block');
  assert.match(first.reason, /changed 2 file\(s\) \/ 32 line\(s\) without a pstack run/);
  assert.equal((await mock.emit('session_stop'))?.decision, 'block');
  assert.equal(await mock.emit('session_stop'), undefined, 'released after the strict budget');
  assert.match(mock.notices.at(-1).message, /without a pstack run/);
  const audit = await readFile(path.join(cwd, '.omp/pstack/runs/session-events.jsonl'), 'utf8');
  assert.equal(audit.match(/"unengaged_stop_blocked"/g)?.length, 2);
});

test('a change within the direct budget, or any change made under a run, never trips', async t => {
  const small = await gitWorkspace(t, 'strict');
  await writeFile(path.join(small.cwd, 'app.js'), 'export const a = 3;\n');
  assert.equal(await small.mock.emit('session_stop'), undefined);

  const engaged = await gitWorkspace(t, 'strict', { headless: true });
  await execute(engaged.mock.tools.get('pstack_gate'), { action: 'init', objective: 'Change', playbook: 'feature', ceremony: 'standard', verificationRequired: false, acceptance: [] }, engaged.mock.ctx);
  await execute(engaged.mock.tools.get('pstack_gate'), { action: 'abandon', reason: 'test' }, engaged.mock.ctx);
  await bigChange(engaged.cwd);
  assert.equal(await engaged.mock.emit('session_stop'), undefined, 'an abandoned run still counts as engagement');
  await engaged.mock.emit('session_shutdown');
  assert.equal(engaged.proc.stderrText, '');
  assert.equal(engaged.proc.exitCode, undefined);

  const off = await gitWorkspace(t, 'strict', { config: { engagementTripwire: false } });
  await bigChange(off.cwd);
  assert.equal(await off.mock.emit('session_stop'), undefined, 'engagementTripwire=false disables it');
});

test('headless auto reports an unengaged change on stderr and exits 3; within budget it stays quiet', async t => {
  const { cwd, mock, proc } = await gitWorkspace(t, 'auto', { headless: true });
  await bigChange(cwd);
  assert.equal(await mock.emit('session_stop'), undefined, 'auto does not block');
  await mock.emit('session_shutdown');
  assert.match(proc.stderrText, /changed 2 file\(s\) \/ 32 line\(s\) without a pstack run/);
  assert.match(proc.stderrText, /Exit status 3 signals unverified work/);
  assert.equal(proc.exitCode, 3);
  proc.exit(0);
  assert.deepEqual(proc.exits, [3]);

  const quiet = await gitWorkspace(t, 'auto', { headless: true });
  await writeFile(path.join(quiet.cwd, 'app.js'), 'export const a = 4;\n');
  await quiet.mock.emit('session_shutdown');
  assert.equal(quiet.proc.stderrText, '');
  assert.equal(quiet.proc.exitCode, undefined);
});
