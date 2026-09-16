import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "bun:test";

async function git(root, ...args) {
  const process = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  assert.equal(exitCode, 0, stderr);
  return stdout.trim();
}

test("risk distribution evaluator records the selected external repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-risk-eval-"));
  try {
    await git(root, "init");
    await git(root, "config", "user.email", "eval@example.test");
    await git(root, "config", "user.name", "Risk evaluator");
    await mkdir(join(root, ".omp"));
    await writeFile(join(root, ".omp", "ompstack-routing.json"), JSON.stringify({ schemaVersion: 1, knownPathPatterns: ["^src/"] }));
    await mkdir(join(root, "src"));
    for (const value of ["one", "two", "three"]) {
      await writeFile(join(root, "src", "index.ts"), `export const value = ${JSON.stringify(value)};\n`);
      await git(root, "add", "src/index.ts");
      await git(root, "commit", "-m", value);
    }
    await mkdir(join(root, "extensions"));
    await writeFile(join(root, "extensions", "runtime.ts"), "export {};\n");
    await git(root, "add", "extensions/runtime.ts");
    await git(root, "commit", "-m", "runtime");
    const output = join(root, "risk-distribution.json");
    const process = Bun.spawn([Bun.which("bun"), fileURLToPath(new URL("../scripts/eval-risk-distribution.mjs", import.meta.url)), "--repo", root, "--count", "2", "--output", output], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
    assert.equal(exitCode, 0, stderr);
    assert.match(stdout, new RegExp(`repository: ${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(stdout, /sample: 2 first-parent commits/);
    assert.match(stdout, /risk distribution \(2 commits\): low=0 medium=1 high=1 critical=0/);
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), {
      schemaVersion: 1,
      repository: root,
      head: await git(root, "rev-parse", "HEAD"),
      sampleCount: 2,
      distribution: { low: 0, medium: 1, high: 1, critical: 0 },
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
