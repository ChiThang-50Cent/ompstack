import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('negative topology catalog covers the promised failure classes', async () => {
  const fixtures = JSON.parse(await readFile('test/fixtures/negative-topologies.json', 'utf8'));
  assert.equal(fixtures.length, 12);
  assert.equal(new Set(fixtures.map(item => item.id)).size, fixtures.length);
  const layers = new Set(fixtures.map(item => item.layer));
  for (const layer of ['runtime-gate','asset-validation','workflow-policy','task-contract','policy','router','review-schema']) assert.ok(layers.has(layer));
});
