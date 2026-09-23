import test from 'node:test';
import assert from 'node:assert/strict';
import { parseModeFlag, tokenizeCommand, validateCeremony, validatePlaybook } from '../dist/src/commands.js';

test('command tokenizer preserves quoted objectives and escapes', () => {
  assert.deepEqual(tokenizeCommand('start feature "add reset flow"'), ['start', 'feature', 'add reset flow']);
  assert.deepEqual(tokenizeCommand("pause 'needs operator approval'"), ['pause', 'needs operator approval']);
  assert.deepEqual(tokenizeCommand('export .omp/pstack/my\\ file.json'), ['export', '.omp/pstack/my file.json']);
});

test('mode/playbook/ceremony validation is strict', () => {
  assert.equal(parseModeFlag('STRICT'), 'strict');
  assert.equal(parseModeFlag('invalid'), undefined);
  assert.equal(validatePlaybook('bug-fix'), true);
  assert.equal(validatePlaybook('random'), false);
  assert.equal(validateCeremony('program'), true);
});
