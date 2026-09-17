import assert from "node:assert/strict";
import { test } from "bun:test";
import { normalizeRouteInput } from "../scripts/routing/route-input.mjs";

const input = {
  intent: "feature",
  targets: ["src/b.ts", "src/a.ts"],
  taskFacts: { behaviorAffecting: true },
  repository: { root: "/repo", base: "HEAD~1", head: "HEAD" },
  riskFacts: { sharedSemanticBoundary: false, consumerFamilies: 1, executionModes: 1, graphTraversal: false, materialUnknown: false },
  graphPolicy: { sourceRoots: { go: [], python: [], typescript: ["src"], java: [] } },
};

test("route input canonicalizes declared scope", () => {
  const normalized = normalizeRouteInput(input);
  assert.deepEqual(normalized.targets, ["src/a.ts", "src/b.ts"]);
  assert.deepEqual(normalized.taskFacts, { behaviorAffecting: true });
  assert.match(normalized.routeInputDigest, /^[a-f0-9]{64}$/);
  assert.equal(normalized.measurementPurpose, undefined);
  assert.deepEqual(normalized.graphPolicy.sourceRoots, { go: [], python: [], typescript: ["src"], java: [] });
});

test("route input rejects caller-controlled measurement purpose", () => {
  assert.throws(() => normalizeRouteInput({ ...input, measurementPurpose: "material" }), /invalid shape/);
});

test("route input rejects unresolved intent before routing", () => {
  assert.throws(() => normalizeRouteInput({ ...input, intent: "unresolved" }), /invalid shape/);
});

