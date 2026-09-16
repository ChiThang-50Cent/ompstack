import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { collectSignals, loadSignalPolicy, SIGNAL_FLAGS } from "../scripts/routing/collect-signals.mjs";
import { classifyRoute } from "../scripts/routing/classify-route.mjs";

const change = (path, addedLines, deletedLines = 0) => ({
  path,
  changeType: "modified",
  binary: false,
  addedLines,
  deletedLines,
});
const routingPolicy = { thresholds: { maxMediumCodeFiles: 5, maxMediumChangedLines: 300, maxMediumAffectedModules: 2, maxMediumReverseDependents: 12 } };
const boundedFacts = { sharedSemanticBoundary: false, consumerFamilies: 1, executionModes: 1, graphTraversal: false, materialUnknown: false };

function classify(signals) {
  return classifyRoute({
    signals,
    graph: { materialUnknown: false, affectedModuleCount: 1, reverseDependentCount: 0 },
    taskFacts: { behaviorAffecting: true },
    riskFacts: boundedFacts,
    policy: routingPolicy,
  });
}


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

test("repository overlay requires explicit per-flag coverage before resolving sensitivity", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-signals-overlay-"));
  try {
    await mkdir(join(root, ".omp"));
    await writeFile(join(root, ".omp", "ompstack-routing.json"), JSON.stringify({
      schemaVersion: 1,
      knownPathPatterns: ["^src/"],
    }));
    let overlayPolicy = await loadSignalPolicy({ root });
    let signals = await collectSignals({
      policy: overlayPolicy,
      changeSet: [change("src/requests/auth.ts", 1)],
    });
    assert.equal(signals.unclassifiedChangedFiles, 0);
    assert.equal(classify(signals).risk, "high");
    assert.equal(signals.touchesAuth, "unknown");

    await writeFile(join(root, ".omp", "ompstack-routing.json"), JSON.stringify({
      schemaVersion: 1,
      knownPathPatterns: ["^src/"],
      pathRules: [
        { id: "requests-auth", pathPattern: "^src/requests/auth\\.ts$", flags: ["touchesAuth"], knownFlags: SIGNAL_FLAGS.filter((flag) => flag !== "touchesAuth") },
        { id: "ordinary-source", pathPattern: "^src/", flags: [], knownFlags: SIGNAL_FLAGS },
      ],
    }));
    overlayPolicy = await loadSignalPolicy({ root });
    signals = await collectSignals({
      policy: overlayPolicy,
      changeSet: [change("src/requests/auth.ts", 1)],
    });
    assert.equal(signals.touchesAuth, true);
    for (const flag of SIGNAL_FLAGS.filter((flag) => flag !== "touchesAuth")) assert.equal(signals[flag], false);

    assert.equal(classify(signals).risk, "critical");
    const ordinary = await collectSignals({
      policy: overlayPolicy,
      changeSet: [change("src/widget.ts", 1)],
    });
    for (const flag of SIGNAL_FLAGS) assert.equal(ordinary[flag], false);

    const sensitive = await collectSignals({
      policy: overlayPolicy,
      changeSet: [change("extensions/runtime.ts", 1)],
    });
    assert.equal(sensitive.touchesRuntimeConfig, true);

    await writeFile(join(root, ".omp", "ompstack-routing.json"), JSON.stringify({
      schemaVersion: 1,
      knownPathPatterns: ["^src/"],
      knownFlags: SIGNAL_FLAGS,
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
