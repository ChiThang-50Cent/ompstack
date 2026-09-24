import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../dist/src/domain.js';
import { evaluateCompletionGates } from '../dist/src/gates.js';
import { initGate } from '../dist/src/gate-control.js';
import { registerCommands } from '../dist/src/commands.js';
import { createInitialState, createRun, reduceState } from '../dist/src/state.js';
import { PstackStore } from '../dist/src/store.js';

function createHarness(cwd) {
  const branch = [];
  const commands = new Map();
  const notices = [];
  const api = {
    logger: { warn() {} },
    appendEntry(customType, data) { branch.push({ customType, data }); },
    registerCommand(name, command) { commands.set(name, command); },
    async exec() { return { stdout: '', stderr: 'not a git worktree', code: 1 }; },
  };
  const ctx = {
    cwd,
    sessionManager: {
      getSessionId: () => 'gate-off-test',
      getBranch: () => branch,
    },
    ui: { notify(message, type = 'info') { notices.push({ message, type }); } },
  };
  return { api, ctx, store: new PstackStore(api), commands, notices, branch };
}

test('off mode refuses gate init without mutating state through tool or command', async t => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-gate-off-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const harness = createHarness(cwd);

  const toolOutcome = await initGate(harness.api, harness.store, harness.ctx, { objective: 'Fix the gate behavior' });
  assert.equal(toolOutcome.ok, false);
  assert.equal(toolOutcome.text, 'Pstack is off for this session. Enable it with /pstack auto, /pstack strict, or --pstack-mode before opening a run.');
  assert.equal(harness.branch.length, 0);

  registerCommands(harness.api, harness.store);
  await harness.commands.get('pstack').handler('init bug-fix Fix the gate behavior', harness.ctx);
  assert.match(harness.notices.at(-1)?.message ?? '', /^Pstack is off for this session\./);
  assert.equal(harness.branch.length, 0);
});

test('active run is still evaluated after mode changes to off', () => {
  const at = '2026-09-24T00:00:00.000Z';
  let state = createInitialState({ ...DEFAULT_CONFIG, defaultMode: 'auto' });
  const run = createRun({
    objective: 'Keep an active gate truthful',
    playbook: 'bug-fix',
    ceremony: 'standard',
    verificationRequired: false,
    acceptance: [{ id: 'AC-1', text: 'criterion remains open' }],
    at,
  });
  state = reduceState(state, { type: 'start_run', run, at });
  state = reduceState(state, { type: 'set_mode', mode: 'off', at });

  const report = evaluateCompletionGates(state, undefined, DEFAULT_CONFIG, { ignoreRunStatus: true });
  assert.equal(report.allowed, false);
  assert.ok(report.issues.some(issue => issue.code === 'ACCEPTANCE_OPEN'));
});
