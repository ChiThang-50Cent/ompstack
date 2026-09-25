import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../dist/src/domain.js';
import { diffTrees, engagedSince, exceedsDirectBudget, snapshotWorkingTree, targetsWorkspace } from '../dist/src/engagement.js';
import { createInitialState } from '../dist/src/state.js';

const exec = {
  async exec(command, args, options = {}) {
    try {
      return { stdout: execFileSync(command, args, { cwd: options.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), stderr: '', code: 0 };
    } catch (error) {
      return { stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? ''), code: error.status ?? 1 };
    }
  },
};

async function repo(t) {
  const cwd = await mkdtemp(path.join(tmpdir(), 'pstack-engagement-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  await writeFile(path.join(cwd, 'a.txt'), 'one\ntwo\n');
  await writeFile(path.join(cwd, '.gitignore'), 'ignored/\n');
  git('add', '.');
  git('commit', '-qm', 'init');
  return { cwd, git };
}

test('snapshots count tracked, staged and untracked changes, skip ignored and pstack paths, and leave the index alone', async t => {
  const { cwd, git } = await repo(t);
  await writeFile(path.join(cwd, 'staged.txt'), 'staged\n');
  git('add', 'staged.txt');
  const before = await snapshotWorkingTree(exec, cwd, DEFAULT_CONFIG);
  assert.match(before, /^[0-9a-f]{40,64}$/);
  const statusBefore = git('status', '--porcelain');

  await writeFile(path.join(cwd, 'a.txt'), 'one\nTWO\nthree\n');
  await writeFile(path.join(cwd, 'new.txt'), 'x\ny\n');
  await mkdir(path.join(cwd, 'ignored'), { recursive: true });
  await writeFile(path.join(cwd, 'ignored', 'big.txt'), 'nope\n'.repeat(100));
  await mkdir(path.join(cwd, '.omp/pstack/runs'), { recursive: true });
  await writeFile(path.join(cwd, '.omp/pstack/runs/state.json'), '{}\n'.repeat(50));

  const after = await snapshotWorkingTree(exec, cwd, DEFAULT_CONFIG);
  const stat = await diffTrees(exec, cwd, before, after);
  assert.deepEqual(stat.paths.sort(), ['a.txt', 'new.txt']);
  assert.equal(stat.files, 2);
  assert.equal(stat.lines, 3 + 2, 'a.txt: 2 added + 1 deleted; new.txt: 2 added');
  assert.equal(git('diff', '--cached', '--name-only').trim(), 'staged.txt', 'the real index is untouched');
  assert.notEqual(git('status', '--porcelain'), '', 'working tree still dirty');
  assert.match(statusBefore, /A  staged.txt/);
});

test('an unchanged tree diffs to zero and a non-git directory yields no snapshot', async t => {
  const { cwd } = await repo(t);
  const a = await snapshotWorkingTree(exec, cwd, DEFAULT_CONFIG);
  const b = await snapshotWorkingTree(exec, cwd, DEFAULT_CONFIG);
  assert.equal(a, b);
  assert.deepEqual(await diffTrees(exec, cwd, a, b), { files: 0, lines: 0, paths: [] });
  const plain = await mkdtemp(path.join(tmpdir(), 'pstack-engagement-plain-'));
  t.after(() => rm(plain, { recursive: true, force: true }));
  assert.equal(await snapshotWorkingTree(exec, plain, DEFAULT_CONFIG), undefined);
});

test('engagement and the direct budget', () => {
  const state = createInitialState(DEFAULT_CONFIG);
  assert.equal(engagedSince(state, '2026-09-25T00:00:00.000Z'), false);
  assert.equal(engagedSince({ ...state, activeRun: { id: 'r' } }, '2026-09-25T00:00:00.000Z'), true);
  const done = { id: 'r', objective: 'o', playbook: 'bug-fix', ceremony: 'standard', status: 'abandoned', createdAt: '2026-09-25T01:00:00.000Z' };
  assert.equal(engagedSince({ ...state, completedRuns: [done] }, '2026-09-25T00:00:00.000Z'), true, 'a run opened this session counts even if abandoned');
  assert.equal(engagedSince({ ...state, completedRuns: [done] }, '2026-09-25T02:00:00.000Z'), false, 'a run from before this session does not');
  assert.equal(exceedsDirectBudget({ files: 1, lines: 20, paths: [] }, DEFAULT_CONFIG), false);
  assert.equal(exceedsDirectBudget({ files: 2, lines: 2, paths: [] }, DEFAULT_CONFIG), true);
  assert.equal(exceedsDirectBudget({ files: 1, lines: 21, paths: [] }, DEFAULT_CONFIG), true);
});

test('edits to assume-unchanged and skip-worktree files are still counted, and the real index keeps its bits', async t => {
  const { cwd, git } = await repo(t);
  await writeFile(path.join(cwd, 'b.txt'), 'b\n');
  git('add', 'b.txt'); git('commit', '-qm', 'b');
  git('update-index', '--assume-unchanged', 'a.txt');
  git('update-index', '--skip-worktree', 'b.txt');
  const before = await snapshotWorkingTree(exec, cwd, DEFAULT_CONFIG);
  await writeFile(path.join(cwd, 'a.txt'), 'changed\n');
  await writeFile(path.join(cwd, 'b.txt'), 'changed\n');
  const stat = await diffTrees(exec, cwd, before, await snapshotWorkingTree(exec, cwd, DEFAULT_CONFIG));
  assert.deepEqual(stat.paths.sort(), ['a.txt', 'b.txt']);
  assert.match(git('ls-files', '-v', 'a.txt', 'b.txt'), /^h a\.txt\nS b\.txt\n$/, 'bits untouched in the real index');
});

test('targetsWorkspace: devices, sandboxes and paths outside the workspace are not workspace writes', () => {
  const cwd = '/work/repo';
  assert.equal(targetsWorkspace('write', { path: 'src/a.ts' }, cwd), true);
  assert.equal(targetsWorkspace('write', { path: '/work/repo/src/a.ts' }, cwd), true);
  assert.equal(targetsWorkspace('edit', { path: '[src/a.ts#1A2B]' }, cwd), true, 'hashline header path');
  assert.equal(targetsWorkspace('write', { path: 'xd://pstack_acceptance' }, cwd), false, 'xd:// device call');
  assert.equal(targetsWorkspace('write', { path: 'local://plan.md' }, cwd), false);
  assert.equal(targetsWorkspace('edit', { path: '[local://scratch.md#ABCD]' }, cwd), false);
  assert.equal(targetsWorkspace('write', { path: '/tmp/scratch.txt' }, cwd), false);
  assert.equal(targetsWorkspace('write', { path: '../other/file.ts' }, cwd), false);
  assert.equal(targetsWorkspace('ast_edit', { paths: ['local://a', 'src/b.ts'] }, cwd), true, 'any workspace path counts');
  assert.equal(targetsWorkspace('ast_edit', { paths: ['local://a'] }, cwd), false);
  assert.equal(targetsWorkspace('edit', { input: '*** Begin Patch' }, cwd), true, 'unknown shape stays blocked');
});
