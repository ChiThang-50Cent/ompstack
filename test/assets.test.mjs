import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validate } from '../scripts/lib/validate.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const EXCLUDED = new Set(['node_modules', '.git', '.upstream', 'dist']);

async function copyRepository(t) {
  const destination = await mkdtemp(path.join(os.tmpdir(), 'pstack-assets-'));
  t.after(() => rm(destination, { recursive: true, force: true }));
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue;
    await cp(path.join(root, entry.name), path.join(destination, entry.name), { recursive: true });
  }
  return destination;
}

async function assertInvalid(t, mutate, message) {
  const copy = await copyRepository(t);
  await mutate(copy);
  const result = await validate(copy);
  assert.ok(result.errors.length > 0, message);
}

test('validator accepts an unmodified repository copy', async t => {
  const copy = await copyRepository(t);
  const result = await validate(copy);
  assert.deepEqual(result.errors, []);
});

test('validator rejects a broken pstack skill link', async t => {
  await assertInvalid(t, async copy => {
    const file = path.join(copy, 'skills/pstack/SKILL.md');
    await writeFile(file, `${await readFile(file, 'utf8')}\nSee skill://pstack/operators/references/nope.md\n`);
  }, 'broken skill link must fail validation');
});

test('validator rejects Cursor subagent_type leftovers', async t => {
  await assertInvalid(t, async copy => {
    const file = path.join(copy, 'skills/pstack/SKILL.md');
    await writeFile(file, `${await readFile(file, 'utf8')}\nsubagent_type: scout\n`);
  }, 'subagent_type must fail validation');
});

test('validator rejects model slugs in assets', async t => {
  await assertInvalid(t, async copy => {
    const file = path.join(copy, 'skills/pstack/SKILL.md');
    await writeFile(file, `${await readFile(file, 'utf8')}\nmodel: claude-opus-5-5-max\n`);
  }, 'provider model slugs must fail validation');
});

test('validator rejects unknown agent tool names', async t => {
  await assertInvalid(t, async copy => {
    const file = path.join(copy, 'agents/pstack-scout.md');
    const source = await readFile(file, 'utf8');
    await writeFile(file, source.replace(/^tools:.*$/m, 'tools: read, frobnicate'));
  }, 'unknown OMP tools must fail validation');
});

test('validator rejects imported content below the fidelity ratio', async t => {
  await assertInvalid(t, async copy => {
    const mapFile = path.join(copy, 'scripts/upstream-map.json');
    const map = JSON.parse(await readFile(mapFile, 'utf8'));
    map[0].status = 'imported';
    await writeFile(mapFile, `${JSON.stringify(map, null, 2)}\n`);
    await writeFile(path.join(copy, map[0].target), 'truncated\n');
  }, 'truncated imported content must fail fidelity validation');
});
