import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { collectChangeSet, digestChangeSet } from "../scripts/change-set.mjs";

async function git(root, ...argumentsList) {
  const process = Bun.spawn(["git", "-C", root, ...argumentsList], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  assert.equal(exitCode, 0, stderr);
  return stdout.trim();
}

async function withRepository(callback) {
  const root = await mkdtemp(join(tmpdir(), "ompstack-change-set-"));
  try {
    await git(root, "init");
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "staged.ts"), "export const staged = 1;\n");
    await writeFile(join(root, "src", "unstaged.ts"), "export const unstaged = 1;\n");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "base");
    const revision = await git(root, "rev-parse", "HEAD");
    await callback({ root, revision });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

test("working-tree change set includes staged, unstaged, and untracked paths", async () => {
  await withRepository(async ({ root, revision }) => {
    await writeFile(join(root, "src", "staged.ts"), "export const staged = 2;\n");
    await git(root, "add", "src/staged.ts");
    await writeFile(join(root, "src", "unstaged.ts"), "export const unstaged = 2;\n");
    await writeFile(join(root, "notes.md"), "untracked\n");

    assert.deepEqual(await collectChangeSet({ root, base: revision, head: revision, workingTree: true }), [
      { path: "notes.md", changeType: "untracked", binary: false, addedLines: 2, deletedLines: 0 },
      { path: "src/staged.ts", changeType: "modified", binary: false, addedLines: 1, deletedLines: 1 },
      { path: "src/unstaged.ts", changeType: "modified", binary: false, addedLines: 1, deletedLines: 1 },
    ]);
  });
});

test("working-tree digest changes when content changes without diff-stat changes", async () => {
  await withRepository(async ({ root, revision }) => {
    await writeFile(join(root, "src", "unstaged.ts"), "export const unstaged = 2;\n");
    const first = await collectChangeSet({ root, base: revision, head: revision, workingTree: true });
    const firstDigest = await digestChangeSet({ root, changeSet: first });

    await writeFile(join(root, "src", "unstaged.ts"), "export const unstaged = 3;\n");
    const second = await collectChangeSet({ root, base: revision, head: revision, workingTree: true });
    const secondDigest = await digestChangeSet({ root, changeSet: second });

    assert.deepEqual(second, first);
    assert.notEqual(secondDigest, firstDigest);
  });
});
