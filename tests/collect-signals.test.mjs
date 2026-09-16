import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { collectSignals, loadSignalPolicy, SIGNAL_FLAGS } from "../scripts/routing/collect-signals.mjs";

const change = (path, addedLines, deletedLines = 0) => ({
  path,
  changeType: "modified",
  binary: false,
  addedLines,
  deletedLines,
});

const policy = {
  schemaVersion: 1,
  policyVersion: "test",
  changedLinesScope: "code-files-only",
  generatedPathPatterns: ["(?:^|/)generated/"],
  codePathPatterns: ["\\.(?:ts|py)$"],
  packageRootMarkers: ["package.json"],
  knownFlags: ["touchesAuthorization"],
  knownPathPatterns: ["^services/auth/", "^notes\\.md$", "^unowned/"],
  pathRules: [
    { id: "auth", pathPattern: "^services/auth/", flags: ["touchesAuth"] },
  ],
};

test("signal collector measures one supplied change set and preserves uncertainty", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-signals-"));
  try {
    await mkdir(join(root, "services/auth"), { recursive: true });
    await writeFile(join(root, "services/auth/package.json"), "{}");
    const signals = await collectSignals({
      root,
      policy,
      changeSet: [
        change("services/auth/login.ts", 4, 2),
        change("notes.md", 8),
        change("unowned/task.py", 3),
      ],
    });

    assert.equal(signals.policyVersion, "test");
    assert.equal(signals.changedCodeFiles, 2);
    assert.equal(signals.changedLines, 9);
    assert.equal(signals.changedLinesScope, "code-files-only");
    assert.equal(signals.unclassifiedChangedFiles, 0);
    assert.equal(signals.packageRoots, 1);
    assert.equal(signals.touchesAuth, true);
    assert.equal(signals.touchesAuthorization, false);
    for (const flag of SIGNAL_FLAGS.filter((flag) => !["touchesAuth", "touchesAuthorization"].includes(flag))) {
      assert.equal(signals[flag], "unknown");
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("signal collector preserves unknowns outside configured repository paths", async () => {
  const signals = await collectSignals({
    policy,
    changeSet: [change("external/service.ts", 1)],
  });
  assert.equal(signals.unclassifiedChangedFiles, 1);
  assert.equal(signals.touchesAuthorization, "unknown");
});

test("signal collector rejects malformed change paths", async () => {
  await assert.rejects(
    collectSignals({ policy, changeSet: [change("../secret.ts", 1)] }),
    /changeSet has an invalid entry/,
  );
});

test("default policy gives known ompstack paths determinate signal values", async () => {
  const signals = await collectSignals({
    changeSet: [
      change("scripts/routing/policy.mjs", 1),
      change(".omp/AGENTS.md", 1),
      change(".omp-plugin/marketplace.json", 1),
      change(".gitignore", 1),
      change("bun.lock", 1),
      change("tsconfig.plugin.json", 1),
    ],
  });
  assert.equal(signals.unclassifiedChangedFiles, 0);
  for (const flag of SIGNAL_FLAGS) assert.equal(signals[flag], false);
});

test("repository overlay only adds known paths without replacing sensitive rules", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-signals-overlay-"));
  try {
    await mkdir(join(root, ".omp"));
    await writeFile(join(root, ".omp", "ompstack-routing.json"), JSON.stringify({
      schemaVersion: 1,
      knownPathPatterns: ["^src/"],
    }));
    const overlayPolicy = await loadSignalPolicy({ root });
    const known = await collectSignals({
      policy: overlayPolicy,
      changeSet: [change("src/widget.ts", 1)],
    });
    assert.equal(known.unclassifiedChangedFiles, 0);
    for (const flag of SIGNAL_FLAGS) assert.equal(known[flag], false);

    const sensitive = await collectSignals({
      policy: overlayPolicy,
      changeSet: [change("extensions/runtime.ts", 1)],
    });
    assert.equal(sensitive.touchesRuntimeConfig, true);

    await writeFile(join(root, ".omp", "ompstack-routing.json"), JSON.stringify({
      schemaVersion: 1,
      knownPathPatterns: ["^src/"],
      pathRules: [],
    }));
    await assert.rejects(loadSignalPolicy({ root }), /overlay has an invalid shape/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("default empty mapping leaves every sensitive flag unknown", async () => {
  const signals = await collectSignals({
    changeSet: [change("src/index.ts", 1)],
  });
  for (const flag of SIGNAL_FLAGS) assert.equal(signals[flag], "unknown");
});
