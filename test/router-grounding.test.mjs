import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTask } from '../dist/src/router.js';
import { buildPolicySegment } from '../dist/src/policy.js';
import { createInitialState } from '../dist/src/state.js';
import { DEFAULT_CONFIG } from '../dist/src/domain.js';

// Held out from eval/cases.json: phrasings from the pstack README, the talk, and non-English users.
const UNGROUNDED = [
  'the left sidebar is laggy when I scroll',
  '??? (screenshot attached)',
  'the PR tab is not working anymore',
  'make the new settings page pixel-identical to the old one',
  'Sidebar bên trái bị giật khi cuộn',
  'Tab PR không hoạt động nữa, sửa giúp',
  'Tôi đi ngủ đây, merge hết stack trước sáng mai',
];

function policyFor(prompt, mode = 'auto') {
  const state = { ...createInitialState(DEFAULT_CONFIG), mode };
  return buildPolicySegment(state, classifyTask(prompt), DEFAULT_CONFIG);
}

test('prompts without a playbook signal are ungrounded and hand the choice to the model', () => {
  for (const prompt of UNGROUNDED) {
    const decision = classifyTask(prompt);
    assert.equal(decision.grounded, false, prompt);
    assert.ok(decision.confidence < 0.45, `${prompt}: ungrounded confidence stays below every grounded score`);
    const policy = policyFor(prompt);
    assert.doesNotMatch(policy, /playbooks\/feature\.md/, `${prompt}: no forced feature playbook`);
    assert.doesNotMatch(policy, /Router suggestion/, prompt);
    assert.match(policy, /Choose the playbook yourself/, prompt);
    assert.match(policy, /change within 1 file\(s\) \/ 20 changed line\(s\) may stay direct/, prompt);
  }
});

test('grounded prompts keep the suggestion but allow a better table row', () => {
  const decision = classifyTask('this pr has a subtle bug where the scroll drifts every 750ms. repro first, then fix and verify');
  assert.equal(decision.grounded, true);
  assert.equal(decision.playbook, 'bug-fix');
  const policy = policyFor('this pr has a subtle bug where the scroll drifts every 750ms. repro first, then fix and verify');
  assert.match(policy, /Router suggestion: bug-fix\//);
  assert.match(policy, /unless a better row in the skill:\/\/pstack routing table fits/);
});

test('ungrounded prompts with risk signals keep a ceremony floor', () => {
  const decision = classifyTask('Đổi cách lưu token trong production');
  assert.equal(decision.grounded, false);
  assert.equal(decision.ceremony, 'strict');
  assert.match(policyFor('Đổi cách lưu token trong production'), /strict ceremony floor/);
});

test('"rename this variable" is direct', () => {
  const decision = classifyTask('rename this variable');
  assert.equal(decision.ceremony, 'direct');
  assert.match(policyFor('rename this variable'), /Keep this task direct/);
  assert.match(policyFor('rename this variable'), /within 1 file\(s\) \/ 20 changed line\(s\)/);
});

test('strict mode never leaves an ungrounded request to the model to skip the run', () => {
  const policy = policyFor('Tab PR không hoạt động nữa, sửa giúp', 'strict');
  assert.match(policy, /Edits without a run are blocked when a Git baseline is available/);
  assert.match(policy, /outside Git the tripwire stays silent/);
  assert.doesNotMatch(policy, /may stay direct/);
});

test('no-Git policy capability suppresses tripwire promises for direct and grounded prompts', () => {
  const state = { ...createInitialState(DEFAULT_CONFIG), mode: 'strict' };
  const direct = buildPolicySegment(state, classifyTask('rename this variable'), DEFAULT_CONFIG, false);
  const grounded = buildPolicySegment(state, classifyTask('fix this reproduced bug and verify it'), DEFAULT_CONFIG, false);
  assert.doesNotMatch(direct, /larger run-less changes are reported|strict blocks stop attempts/);
  assert.doesNotMatch(grounded, /changes beyond 1 file\(s\) \/ 20 changed line\(s\) are reported/);
});
