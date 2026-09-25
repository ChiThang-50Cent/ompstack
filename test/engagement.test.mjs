import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../dist/src/domain.js';
import { diffTrees, engagedSince, exceedsDirectBudget, snapshotWorkingTree } from '../dist/src/engagement.js';
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
  const config = {
    ...DEFAULT_CONFIG,
    fingerprintIgnore: [...DEFAULT_CONFIG.fingerprintIgnore, 'ignored-tracked.txt'],
    auditDirectory: 'audit-dir',
  };
  await writeFile(path.join(cwd, 'staged.txt'), 'staged\n');
  await writeFile(path.join(cwd, 'ignored-tracked.txt'), 'ignored\n');
  git('add', 'staged.txt', 'ignored-tracked.txt');
  const before = await snapshotWorkingTree(exec, cwd, config);
  assert.match(before, /^[0-9a-f]{40,64}$/);
  const statusBefore = git('status', '--porcelain');

  await writeFile(path.join(cwd, 'a.txt'), 'one\nTWO\nthree\n');
  await writeFile(path.join(cwd, 'new.txt'), 'x\ny\n');
  await writeFile(path.join(cwd, 'ignored-tracked.txt'), 'changed but excluded\n');
  await mkdir(path.join(cwd, 'ignored'), { recursive: true });
  await writeFile(path.join(cwd, 'ignored', 'big.txt'), 'nope\n'.repeat(100));
  await mkdir(path.join(cwd, '.omp/pstack/runs'), { recursive: true });
  await writeFile(path.join(cwd, '.omp/pstack/runs/state.json'), '{}\n'.repeat(50));

  const after = await snapshotWorkingTree(exec, cwd, config);
  const stat = await diffTrees(exec, cwd, before, after);
  assert.deepEqual(stat.paths.sort(), ['a.txt', 'new.txt']);
  assert.equal(stat.files, 2);
  assert.equal(stat.lines, 3 + 2, 'a.txt: 2 added + 1 deleted; new.txt: 2 added');
  assert.equal(git('diff', '--cached', '--name-only').split('\n').filter(Boolean).sort().join('\n'), 'ignored-tracked.txt\nstaged.txt', 'the real index is untouched');
  assert.notEqual(git('status', '--porcelain'), '', 'working tree still dirty');
  assert.match(statusBefore, /A  staged.txt/);
});
test('scratch snapshots refresh assume-unchanged and skip-worktree entries without touching the real index', async t => {
  const { cwd, git } = await repo(t);
  await writeFile(path.join(cwd, 'b.txt'), 'one\n');
  git('add', 'b.txt');
  git('commit', '-qm', 'add b');
  git('update-index', '--assume-unchanged', '--', 'a.txt');
  git('update-index', '--skip-worktree', '--', 'b.txt');
  const before = await snapshotWorkingTree(exec, cwd, DEFAULT_CONFIG);
  await writeFile(path.join(cwd, 'a.txt'), 'changed\n');
  await writeFile(path.join(cwd, 'b.txt'), 'changed\n');
  const after = await snapshotWorkingTree(exec, cwd, DEFAULT_CONFIG);
  assert.deepEqual(await diffTrees(exec, cwd, before, after), { files: 2, lines: 5, paths: ['a.txt', 'b.txt'] });
  assert.match(git('ls-files', '-v', 'a.txt'), /^h /, 'assume-unchanged remains on the real index');
  assert.match(git('ls-files', '-v', 'b.txt'), /^S /, 'skip-worktree remains on the real index');
});

test('scratch indexes remain Git-private when TMPDIR is inside the worktree', async t => {
  const { cwd, git } = await repo(t);
  const localTmp = path.join(cwd, 'tmp');
  await mkdir(localTmp, { recursive: true });
  await writeFile(path.join(localTmp, 'marker.txt'), 'tmp\n');
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = localTmp;
  t.after(() => {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  });
  const before = await snapshotWorkingTree(exec, cwd, DEFAULT_CONFIG);
  const after = await snapshotWorkingTree(exec, cwd, DEFAULT_CONFIG);
  assert.equal(before, after);
  assert.deepEqual(await diffTrees(exec, cwd, before, after), { files: 0, lines: 0, paths: [] });
  assert.equal(git('status', '--porcelain'), '?? tmp/\n');
});

test('nested workspace snapshots scope changes and audit files to the active directory', async t => {
  const { cwd: root, git } = await repo(t);
  const workspace = path.join(root, 'packages', 'app');
  await mkdir(workspace, { recursive: true });
  await mkdir(path.join(root, 'packages', 'other'), { recursive: true });
  await writeFile(path.join(workspace, 'app.js'), 'export const app = 1;\n');
  await writeFile(path.join(root, 'packages', 'other', 'other.js'), 'export const other = 1;\n');
  git('add', '.');
  git('commit', '-qm', 'workspaces');
  const before = await snapshotWorkingTree(exec, workspace, DEFAULT_CONFIG);
  await writeFile(path.join(workspace, 'app.js'), 'export const app = 2;\n');
  await writeFile(path.join(root, 'packages', 'other', 'other.js'), 'export const other = 2;\n');
  await mkdir(path.join(workspace, '.omp/pstack/runs'), { recursive: true });
  await writeFile(path.join(workspace, '.omp/pstack/runs/session-events.jsonl'), 'audit\n');
  const after = await snapshotWorkingTree(exec, workspace, DEFAULT_CONFIG);
  assert.deepEqual(await diffTrees(exec, workspace, before, after), {
    files: 1,
    lines: 2,
    paths: ['packages/app/app.js'],
  });
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
  assert.equal(engagedSince({ ...state, activeRun: { id: 'r', status: 'active' } }, '2026-09-25T00:00:00.000Z'), true);
  assert.equal(engagedSince({ ...state, activeRun: { id: 'r', status: 'done' } }, '2026-09-25T00:00:00.000Z'), false, 'a terminal run retained in activeRun is not current engagement');
  const done = { id: 'r', objective: 'o', playbook: 'bug-fix', ceremony: 'standard', status: 'failed', createdAt: '2026-09-25T01:00:00.000Z' };
  assert.equal(engagedSince({ ...state, completedRuns: [done] }, '2026-09-25T00:00:00.000Z'), true, 'a run opened this session counts even if abandoned');
  assert.equal(engagedSince({ ...state, completedRuns: [done] }, '2026-09-25T02:00:00.000Z'), false, 'a run from before this session does not');
  assert.equal(exceedsDirectBudget({ files: 1, lines: 20, paths: [] }, DEFAULT_CONFIG), false);
  assert.equal(exceedsDirectBudget({ files: 2, lines: 2, paths: [] }, DEFAULT_CONFIG), true);
  assert.equal(exceedsDirectBudget({ files: 1, lines: 21, paths: [] }, DEFAULT_CONFIG), true);
});
