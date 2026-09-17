import assert from "node:assert/strict";
import { test } from "bun:test";

import { labelsForComments, missingLabeledPaths } from "../scripts/eval-aacr.mjs";

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
