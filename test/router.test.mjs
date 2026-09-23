import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTask, defaultVerificationRequired } from '../dist/src/router.js';

test('router keeps a tiny local edit direct', () => {
  const result = classifyTask('Fix a one-line typo in the local label');
  assert.equal(result.ceremony, 'direct');
  assert.equal(result.verificationRequired, false);
});

test('router escalates security and migrations', () => {
  const security = classifyTask('Implement authorization for a public API with personal data');
  assert.equal(security.playbook, 'security');
  assert.equal(security.ceremony, 'strict');
  assert.equal(security.verificationRequired, true);

  const migration = classifyTask('Perform a database schema migration and backfill with rollback');
  assert.equal(migration.playbook, 'migration');
  assert.equal(migration.ceremony, 'strict');
});

test('router recognizes investigation and program scope', () => {
  const investigation = classifyTask('Research and explain how request ownership flows through this codebase');
  assert.equal(investigation.playbook, 'investigation');

  const program = classifyTask('Plan a multi-day large migration across multiple workstreams and multiple PRs');
  assert.equal(program.ceremony, 'program');
});

test('verification defaults are proportional', () => {
  assert.equal(defaultVerificationRequired('feature', 'standard'), true);
  assert.equal(defaultVerificationRequired('investigation', 'standard'), false);
  assert.equal(defaultVerificationRequired('documentation', 'strict'), true);
});
