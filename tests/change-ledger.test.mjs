import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import {
  assertLedgerReadyForCloseout,
  createChangeLedger,
  dispositionLedgerEntry,
} from "../scripts/change-ledger.mjs";

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

async function withLedgerRepository(callback) {
  const root = await mkdtemp(join(tmpdir(), "ompstack-change-ledger-"));
  try {
    await git(root, "init");
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "source.ts"), "export const value = 1;\n");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "base");
    const base = await git(root, "rev-parse", "HEAD");

    await mkdir(join(root, "generated"), { recursive: true });
    await mkdir(join(root, "vendor"), { recursive: true });
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "src", "source.ts"), "export const value = 2;\n");
    await writeFile(join(root, "generated", "client.ts"), "export const generated = true;\n");
    await writeFile(join(root, "package-lock.json"), "{\"lockfileVersion\":3}\n");
    await writeFile(join(root, "vendor", "library.js"), "module.exports = 1;\n");
    await writeFile(join(root, "assets", "image.bin"), Buffer.from([0, 1, 2]));
    await writeFile(join(root, "src", "large.ts"), "x\n".repeat(10001));
    await writeFile(join(root, "src", "line\nbreak.ts"), "export const newlinePath = true;\n");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "mixed change set");
    const head = await git(root, "rev-parse", "HEAD");
    await mkdir(join(root, "notes"));
    await writeFile(join(root, "notes", "untracked.md"), "untracked review target\n");
    await symlink("../missing-target", join(root, "notes", "dangling"));
    await callback({ base, head, root });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

test("change ledger retains every changed and untracked path", async () => {
  await withLedgerRepository(async ({ base, head, root }) => {
    const ledger = await createChangeLedger({
      base,
      head,
      root,
      generatedAt: "2026-09-15T00:00:00.000Z",
    });
    assert.equal(ledger.schemaVersion, 1);
    assert.deepEqual(ledger.totals, { pending: 5, reviewed: 0, skipped: 4 });
    assert.deepEqual(
      ledger.entries.map((entry) => entry.path),
      [
        "assets/image.bin",
        "generated/client.ts",
        "notes/dangling",
        "notes/untracked.md",
        "package-lock.json",
        "src/large.ts",
        "src/line\nbreak.ts",
        "src/source.ts",
        "vendor/library.js",
      ],
    );
    const entries = new Map(ledger.entries.map((entry) => [entry.path, entry]));
    assert.deepEqual(entries.get("assets/image.bin"), {
      path: "assets/image.bin", changeType: "added", disposition: "skipped", reason: "binary",
    });
    assert.equal(entries.get("generated/client.ts").reason, "generated");
    assert.equal(entries.get("vendor/library.js").reason, "vendored");
    assert.equal(entries.get("src/large.ts").reason, "size-cap");
    assert.equal(entries.get("package-lock.json").disposition, "pending");
    assert.equal(entries.get("notes/untracked.md").changeType, "untracked");
    assert.equal(entries.get("src/line\nbreak.ts").changeType, "added");
    assert.throws(() => assertLedgerReadyForCloseout(ledger), /pending entries/);

    let resolved = ledger;
    for (const entry of ledger.entries.filter((item) => item.disposition === "pending")) {
      resolved = dispositionLedgerEntry(resolved, { path: entry.path, disposition: "reviewed" });
    }
    assert.doesNotThrow(() => assertLedgerReadyForCloseout(resolved));
    assert.deepEqual(resolved.totals, { pending: 0, reviewed: 5, skipped: 4 });
  });
});

test("change ledger requires terminal reasons and preserves entries", async () => {
  await withLedgerRepository(async ({ base, head, root }) => {
    const ledger = await createChangeLedger({ base, head, root });
    assert.throws(
      () => dispositionLedgerEntry(ledger, { path: "src/source.ts", disposition: "skipped" }),
      /require a reason/,
    );
    assert.throws(
      () => dispositionLedgerEntry(ledger, { path: "missing.ts", disposition: "reviewed" }),
      /not in the ledger/,
    );
    const excluded = await createChangeLedger({
      base,
      head,
      root,
      userExcludedPaths: ["package-lock.json"],
    });
    assert.deepEqual(
      excluded.entries.find((entry) => entry.path === "package-lock.json"),
      {
        path: "package-lock.json",
        changeType: "added",
        disposition: "skipped",
        reason: "user-excluded",
      },
    );
  });
});

test("change ledger reads tracked metadata from the requested revisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-change-ledger-history-"));
  try {
    await git(root, "init");
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await writeFile(join(root, "README.md"), "base\n");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "base");
    const base = await git(root, "rev-parse", "HEAD");
    await writeFile(join(root, "temp.txt"), "historical review target\n");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "add target");
    const head = await git(root, "rev-parse", "HEAD");
    await git(root, "rm", "temp.txt");
    await git(root, "commit", "-m", "delete target");

    const ledger = await createChangeLedger({ base, head, root });
    assert.deepEqual(ledger.entries, [{
      path: "temp.txt",
      changeType: "added",
      disposition: "pending",
      reason: null,
    }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("change ledger caps changed lines while separately capping untracked files", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-change-ledger-size-"));
  try {
    await git(root, "init");
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    const lines = Array.from({ length: 20_000 }, (_, index) => `line ${index}\n`);
    await writeFile(join(root, "big.txt"), lines.join(""));
    await git(root, "add", ".");
    await git(root, "commit", "-m", "large base");
    const base = await git(root, "rev-parse", "HEAD");
    lines[10_000] = "changed\n";
    await writeFile(join(root, "big.txt"), lines.join(""));
    await git(root, "add", ".");
    await git(root, "commit", "-m", "small large-file change");
    const head = await git(root, "rev-parse", "HEAD");
    await writeFile(join(root, "untracked.txt"), "new\n".repeat(10_001));

    const entries = new Map((await createChangeLedger({ base, head, root })).entries.map((entry) => [entry.path, entry]));
    assert.deepEqual(entries.get("big.txt"), {
      path: "big.txt",
      changeType: "modified",
      disposition: "pending",
      reason: null,
    });
    assert.deepEqual(entries.get("untracked.txt"), {
      path: "untracked.txt",
      changeType: "untracked",
      disposition: "skipped",
      reason: "size-cap",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
