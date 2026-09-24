import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const resolver = path.resolve('scripts/lib/resolve-omp.sh');

function fakeOmp(dir, version) {
  mkdirSync(dir, { recursive: true });
  const bin = path.join(dir, 'omp');
  writeFileSync(bin, `#!/bin/sh\necho omp/${version}\n`);
  chmodSync(bin, 0o755);
  return bin;
}

function resolve(env) {
  return execFileSync('sh', ['-c', `. "${resolver}"; resolve_omp`], { env, encoding: 'utf8' }).trim();
}

test('resolve_omp skips node_modules/.bin and returns the host omp', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'resolve-omp-'));
  try {
    fakeOmp(path.join(root, 'node_modules', '.bin'), '0.0.0');
    const host = fakeOmp(path.join(root, 'host-bin'), '9.9.9');
    const PATH = [path.join(root, 'node_modules', '.bin'), path.join(root, 'host-bin'), '/usr/bin', '/bin'].join(':');
    assert.equal(resolve({ PATH }), host);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolve_omp honors PSTACK_OMP_BIN', () => {
  assert.equal(resolve({ PATH: '/usr/bin:/bin', PSTACK_OMP_BIN: '/opt/omp/bin/omp' }), '/opt/omp/bin/omp');
});
