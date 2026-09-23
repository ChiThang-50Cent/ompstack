import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { PLAYBOOKS } from '../dist/src/domain.js';

const root = process.cwd();

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, 'missing frontmatter');
  const fields = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return fields;
}

test('all specialist agents exist and verifier declares a non-writing surface', async () => {
  const expected = ['pstack-scout','pstack-architect','pstack-builder','pstack-reviewer','pstack-judge','pstack-synthesizer','pstack-verifier'];
  const files = (await readdir(path.join(root, 'agents'))).filter(f => f.endsWith('.md')).sort();
  assert.equal(files.length, expected.length);
  const seen = [];
  for (const file of files) {
    const text = await readFile(path.join(root, 'agents', file), 'utf8');
    const fm = frontmatter(text);
    seen.push(fm.name);
    assert.ok(fm.description);
    assert.ok(fm.tools);
    assert.match(text, /output:/);
    assert.doesNotMatch(fm.tools, /\bpstack_/);
    if (fm.name === 'pstack-verifier') {
      assert.doesNotMatch(fm.tools, /\b(edit|write)\b/);
      assert.equal(fm.blocking, 'true');
      assert.match(text, /parent extension records evidence/i);
    }
    if (fm.name === 'pstack-builder' || fm.name === 'pstack-synthesizer') {
      assert.match(fm.tools, /\bedit\b/);
      assert.match(fm.tools, /\bwrite\b/);
    }
  }
  assert.deepEqual(seen.sort(), expected.sort());
});

test('no pstack agent can orchestrate: no task tool and no spawns', async () => {
  for (const file of (await readdir(path.join(root, 'agents'))).filter(f => f.endsWith('.md'))) {
    const fm = frontmatter(await readFile(path.join(root, 'agents', file), 'utf8'));
    assert.doesNotMatch(fm.tools, /\btask\b/, file);
    assert.equal(fm.spawns, undefined, file);
  }
});

test('proof-producing agents are blocking: async spawns deliver no structured output', async () => {
  for (const name of ['pstack-builder', 'pstack-synthesizer', 'pstack-verifier']) {
    const fm = frontmatter(await readFile(path.join(root, 'agents', `${name}.md`), 'utf8'));
    assert.equal(fm.blocking, 'true', name);
  }
});

test('playbook corpus exactly covers runtime playbooks', async () => {
  const files = (await readdir(path.join(root, 'skills/pstack/playbooks'))).filter(f => f.endsWith('.md')).sort();
  assert.deepEqual(files, [...PLAYBOOKS].map(name => `${name}.md`).sort());
  for (const file of files) {
    const text = await readFile(path.join(root, 'skills/pstack/playbooks', file), 'utf8');
    assert.match(text, /## Completion gate/);
    assert.match(text, /pstack_gate action=check|goal op=complete/);
  }
});

test('principles and schemas are complete and parseable', async () => {
  const principleFiles = (await readdir(path.join(root, 'skills/pstack/principles'))).filter(f => f.endsWith('.md'));
  assert.equal(principleFiles.length, 23);
  const schemaFiles = (await readdir(path.join(root, 'skills/pstack/schemas'))).filter(f => f.endsWith('.json'));
  assert.ok(schemaFiles.length >= 8);
  for (const file of schemaFiles) JSON.parse(await readFile(path.join(root, 'skills/pstack/schemas', file), 'utf8'));
});
