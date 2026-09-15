import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { analyzeImportGraph } from "../scripts/routing/import-graph.mjs";

const policy = {
  policyVersion: "test",
  sourceRoots: { go: [], python: [], typescript: ["src"], java: [] },
};
const changeSet = (path, changeType = "modified") => [{ path, changeType }];

test("import graph traverses reverse TypeScript dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-import-graph-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/core.ts"), "export const core = 1;\n");
    await writeFile(join(root, "src/api.ts"), "import { core } from './core'; export { core };\n");
    const graph = await analyzeImportGraph({ root, policy, changeSet: changeSet("src/core.ts") });
    assert.deepEqual(graph, {
      schemaVersion: 1,
      policyVersion: "test",
      status: "complete",
      materialUnknown: false,
      partialReasons: [],
      changedModules: ["src/core.ts"],
      affectedModules: ["src/api.ts", "src/core.ts"],
      reverseDependents: ["src/api.ts"],
      maxDepth: 1,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("import graph fails closed for Java and deleted sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "ompstack-import-java-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/Main.java"), "class Main {}\n");
    const graph = await analyzeImportGraph({
      root,
      policy: { ...policy, sourceRoots: { ...policy.sourceRoots, java: ["src"] } },
      changeSet: changeSet("src/Main.java", "deleted"),
    });
    assert.equal(graph.status, "partial");
    assert.equal(graph.materialUnknown, true);
    assert.deepEqual(graph.partialReasons, ["deleted-or-unowned-source", "java-semantic-dependencies-unsupported"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
