import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildRecord, classifySample, labelsForComments, missingLabeledPaths, resumeState } from "../scripts/eval-aacr.mjs";

test("AACR labels map comment categories and repo context to benchmark groups", () => {
  assert.deepEqual(labelsForComments([
    { category: "Security Vulnerability", context: "File Level" },
    { category: "Code Defect", context: "Repo Level" },
    { category: "Performance", context: "Diff Level" },
  ]), {
    security: true,
    defect: true,
    repoLevel: true,
    softOnly: false,
  });
  assert.deepEqual(labelsForComments([
    { category: "Maintainability and Readability", context: "File Level" },
    { category: "Performance", context: "Diff Level" },
  ]), {
    security: false,
    defect: false,
    repoLevel: false,
    softOnly: true,
  });
});

test("AACR labeled paths must be a subset of target-parent changed paths", () => {
  const comments = [
    { path: "src/present.ts" },
    { path: "src/missing.ts" },
    { path: "src/missing.ts" },
  ];
  const changeSet = [
    { path: "src/present.ts" },
    { path: "src/extra.ts" },
  ];
  assert.deepEqual(missingLabeledPaths(comments, changeSet), ["src/missing.ts"]);
  assert.deepEqual(missingLabeledPaths([{ path: "src/present.ts" }], changeSet), []);
});

test("AACR evaluator records an unavailable commit instead of aborting", async () => {
  const repository = await mkdtemp(join(tmpdir(), "ompstack-aacr-unavailable-"));
  try {
    const initialized = Bun.spawn(["git", "init", "--bare", repository], { stdout: "pipe", stderr: "pipe" });
    assert.equal(await initialized.exited, 0);
    const result = await classifySample("missing/repository", repository, {
      githubPrUrl: "https://github.com/missing/repository/pull/1",
      project_main_language: "Python",
      source_commit: "1".repeat(40),
      target_commit: "2".repeat(40),
      comments: [],
    }, {});
    assert.deepEqual(result, {
      excluded: true,
      exclusionType: "commitUnavailable",
      prUrl: "https://github.com/missing/repository/pull/1",
      language: "Python",
      reason: "commit-unavailable",
    });
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("AACR record keeps unavailable commits out of the base-validation rate", () => {
  const sample = (prUrl) => ({ githubPrUrl: prUrl });
  const record = buildRecord({
    dataset: "/dataset",
    datasetCommit: "a".repeat(40),
    limit: null,
    languages: new Set(["Go"]),
    samples: [sample("available"), sample("base-invalid"), sample("unavailable")],
    records: [{ prUrl: "available", language: "Go", risk: "medium", affectedModuleCount: 1, labels: { security: false, defect: true, repoLevel: false } }],
    baseExclusions: [{ prUrl: "base-invalid", reason: "labeled-paths-not-in-resolved-diff" }],
    unavailable: [{ prUrl: "unavailable", reason: "commit-unavailable" }],
    status: "complete",
  });
  assert.equal(record.exclusions.commitUnavailable.count, 1);
  assert.deepEqual(record.exclusions.baseValidation, {
    count: 1,
    denominator: 2,
    rate: 0.5,
    threshold: 0.15,
    records: [{ prUrl: "base-invalid", reason: "labeled-paths-not-in-resolved-diff" }],
  });
  assert.equal(record.status, "invalid-base-design");
});

test("AACR resume restores recorded outcomes for the same selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-aacr-resume-"));
  const output = join(root, "record.json");
  const commit = "a".repeat(40);
  const samples = [
    { githubPrUrl: "https://github.com/example/project/pull/1" },
    { githubPrUrl: "https://github.com/example/project/pull/2" },
  ];
  const record = buildRecord({
    dataset: "/dataset",
    datasetCommit: commit,
    limit: 2,
    languages: new Set(["Go"]),
    samples,
    records: [{ prUrl: samples[0].githubPrUrl, language: "Go", risk: "medium", affectedModuleCount: 1, labels: { security: false, defect: true, repoLevel: false } }],
    baseExclusions: [],
    unavailable: [{ prUrl: samples[1].githubPrUrl, reason: "commit-unavailable" }],
    status: "in-progress",
  });
  try {
    await writeFile(output, JSON.stringify(record));
    const resumed = await resumeState(output, commit, 2, new Set(["Go"]), samples);
    assert.deepEqual(resumed, {
      records: [{ prUrl: samples[0].githubPrUrl, language: "Go", risk: "medium", affectedModuleCount: 1, labels: { security: false, defect: true, repoLevel: false } }],
      baseExclusions: [],
      unavailable: [{ prUrl: samples[1].githubPrUrl, reason: "commit-unavailable" }],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
