import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "bun:test";

import { collectSignals, loadSignalPolicy, SIGNAL_FLAGS } from "../scripts/routing/collect-signals.mjs";
import { classifyRoute } from "../scripts/routing/classify-route.mjs";

const script = fileURLToPath(new URL("../scripts/init-overlay.mjs", import.meta.url));

async function runGenerator(...args) {
  const process = Bun.spawn([Bun.which("bun"), script, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("overlay generator emits deterministic per-root drafts and exact heuristic rules", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-init-overlay-"));
  try {
    await mkdir(join(root, "src", "auth"), { recursive: true });
    await mkdir(join(root, "tests"));
    await mkdir(join(root, ".git"));
    await mkdir(join(root, "node_modules", "token-package"), { recursive: true });
    await mkdir(join(root, ".omp"));
    await writeFile(join(root, "README.md"), "# Fixture\n");
    await writeFile(join(root, "src", "index.ts"), "export {};\n");
    await writeFile(join(root, "src", "auth", "token.ts"), "export {};\n");
    await writeFile(join(root, "tests", "parser.test.ts"), "export {};\n");
    await writeFile(join(root, ".git", "config"), "ignored\n");
    await writeFile(join(root, "node_modules", "token-package", "index.js"), "ignored\n");
    await writeFile(join(root, ".omp", "ignored-token.ts"), "ignored\n");

    const firstPreview = await runGenerator("--repo", root, "--dry-run");
    const secondPreview = await runGenerator("--dry-run", "--repo", root);
    assert.equal(firstPreview.exitCode, 0, firstPreview.stderr);
    assert.equal(secondPreview.exitCode, 0, secondPreview.stderr);
    assert.equal(secondPreview.stdout, firstPreview.stdout);
    assert.match(firstPreview.stderr, /scanned 4 files; top-level directories 2; generated 4 rules; paths requiring confirmation 2/);

    const overlay = JSON.parse(firstPreview.stdout);
    assert.deepEqual(overlay.knownPathPatterns, ["^(?:README\\.md)$", "^src/", "^tests/"]);
    assert.equal(overlay.pathRules.length, 4);
    assert.ok(overlay.pathRules.every((rule) => rule.reviewed === false));
    assert.deepEqual(overlay.pathRules.slice(0, 2).map((rule) => rule.id), ["ordinary-src", "ordinary-tests"]);
    assert.deepEqual(overlay.pathRules.slice(0, 2).map((rule) => rule.knownFlags), [
      [...SIGNAL_FLAGS].sort(),
      [...SIGNAL_FLAGS].sort(),
    ]);
    assert.deepEqual(overlay.pathRules[2], {
      id: "heuristic-src/auth/token.ts",
      pathPattern: "^src/auth/token\\.ts$",
      flags: ["touchesAuth"],
      knownFlags: SIGNAL_FLAGS.filter((flag) => flag !== "touchesAuth").sort(),
      reviewed: false,
    });
    assert.deepEqual(overlay.pathRules[3].flags, ["touchesExposedParser"]);

    const written = await runGenerator("--repo", root);
    assert.equal(written.exitCode, 0, written.stderr);
    assert.equal(await readFile(join(root, ".omp", "ompstack-routing.json"), "utf8"), firstPreview.stdout);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("generated ordinary rules do not spread critical risk from exact heuristic hits", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-init-overlay-risk-"));
  try {
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "index.ts"), "export {};\n");
    await writeFile(join(root, "src", "auth.ts"), "export {};\n");
    const generated = await runGenerator("--repo", root);
    assert.equal(generated.exitCode, 0, generated.stderr);
    const policy = await loadSignalPolicy({ root });
    const classify = (signals) => classifyRoute({
      signals,
      graph: { materialUnknown: false, affectedModuleCount: 1, reverseDependentCount: 0 },
      taskFacts: { behaviorAffecting: true },
      riskFacts: {
        sharedSemanticBoundary: false,
        consumerFamilies: 1,
        executionModes: 1,
        graphTraversal: false,
        materialUnknown: false,
      },
      policy: {
        thresholds: {
          maxMediumCodeFiles: 5,
          maxMediumChangedLines: 300,
          maxMediumAffectedModules: 2,
          maxMediumReverseDependents: 12,
        },
      },
    });
    const change = (path) => [{ path, changeType: "modified", binary: false, addedLines: 1, deletedLines: 0 }];
    const ordinary = classify(await collectSignals({ root, policy, changeSet: change("src/index.ts") }));
    const exactHit = classify(await collectSignals({ root, policy, changeSet: change("src/auth.ts") }));

    assert.notEqual(ordinary.risk, "critical");
    assert.equal(exactHit.risk, "critical");
    assert.deepEqual(exactHit.reasonCodes, ["critical:touchesAuth"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
test("common heuristic hits emit uncertainty coverage instead of flags", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-init-overlay-common-"));
  try {
    await mkdir(join(root, "src", "files"), { recursive: true });
    await mkdir(join(root, "src", "shellexec"), { recursive: true });
    await writeFile(join(root, "src", "files", "upload.ts"), "export {};\n");
    await writeFile(join(root, "src", "shellexec", "runner.ts"), "export {};\n");

    const generated = await runGenerator("--repo", root, "--dry-run");
    assert.equal(generated.exitCode, 0, generated.stderr);
    const overlay = JSON.parse(generated.stdout);
    const common = overlay.pathRules.find((rule) => rule.id === "heuristic-src/files/upload.ts");
    const distinctive = overlay.pathRules.find((rule) => rule.id === "heuristic-src/shellexec/runner.ts");

    assert.deepEqual(common.flags, []);
    assert.deepEqual(common.knownFlags, SIGNAL_FLAGS.filter((flag) => flag !== "touchesPersistence").sort());
    assert.deepEqual(distinctive.flags, ["touchesExposedParser"]);
    assert.deepEqual(distinctive.knownFlags, SIGNAL_FLAGS.filter((flag) => flag !== "touchesExposedParser").sort());
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
