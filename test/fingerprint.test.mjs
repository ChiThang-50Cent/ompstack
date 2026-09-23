import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_CONFIG } from '../dist/src/domain.js';
import { computeArtifactFingerprint } from '../dist/src/fingerprint.js';

const exec = {
  async exec(command, args, options = {}) {
    try {
      const stdout = execFileSync(command, args, { cwd: options.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { stdout, stderr: '', code: 0 };
    } catch (error) {
      return { stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? ''), code: error.status ?? 1 };
    }
  },
};

async function temp(prefix) { return mkdtemp(path.join(tmpdir(), prefix)); }

test('workspace fingerprint is stable, content-sensitive, and ignores audit state', async t => {
  const cwd = await temp('pstack-fp-');
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(path.join(cwd, 'a.txt'), 'one');
  const first = await computeArtifactFingerprint(exec, cwd, DEFAULT_CONFIG);
  const second = await computeArtifactFingerprint(exec, cwd, DEFAULT_CONFIG);
  assert.equal(first.digest, second.digest);
  await mkdir(path.join(cwd, '.omp/pstack'), { recursive: true });
  await writeFile(path.join(cwd, '.omp/pstack/state.json'), 'ignored');
  const ignored = await computeArtifactFingerprint(exec, cwd, DEFAULT_CONFIG);
  assert.equal(ignored.digest, first.digest);
  await writeFile(path.join(cwd, 'a.txt'), 'two');
  const changed = await computeArtifactFingerprint(exec, cwd, DEFAULT_CONFIG);
  assert.notEqual(changed.digest, first.digest);
});

test('git fingerprint binds HEAD, tracked diff, and untracked content', async t => {
  const cwd = await temp('pstack-git-fp-');
  t.after(() => rm(cwd, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd });
  await writeFile(path.join(cwd, 'tracked.txt'), 'base\n');
  execFileSync('git', ['add', '.'], { cwd });
  execFileSync('git', ['commit', '-qm', 'base'], { cwd });
  const clean = await computeArtifactFingerprint(exec, cwd, DEFAULT_CONFIG);
  assert.equal(clean.kind, 'git');
  assert.equal(clean.clean, true);
  await writeFile(path.join(cwd, 'tracked.txt'), 'changed\n');
  const dirty = await computeArtifactFingerprint(exec, cwd, DEFAULT_CONFIG);
  assert.notEqual(dirty.digest, clean.digest);
  await writeFile(path.join(cwd, 'new.txt'), 'untracked\n');
  const untracked = await computeArtifactFingerprint(exec, cwd, DEFAULT_CONFIG);
  assert.notEqual(untracked.digest, dirty.digest);
});

test('pstack audit state never changes the fingerprint, whatever fingerprintIgnore says', async t => {
  const cwd = await temp('pstack-fp-ignore-');
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const config = { ...DEFAULT_CONFIG, fingerprintIgnore: ['node_modules'], auditDirectory: 'audit/pstack' };
  await writeFile(path.join(cwd, 'a.txt'), 'one');
  const before = await computeArtifactFingerprint(exec, cwd, config);
  for (const dir of ['.omp/pstack/runs/r1', 'audit/pstack/r1']) {
    await mkdir(path.join(cwd, dir), { recursive: true });
    await writeFile(path.join(cwd, dir, 'events.jsonl'), '{}\n');
  }
  assert.equal((await computeArtifactFingerprint(exec, cwd, config)).digest, before.digest);
});
