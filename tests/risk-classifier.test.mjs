import assert from "node:assert/strict";
import { test } from "bun:test";
import { deriveRiskFloorFromFacts } from "../scripts/routing/classify-risk.mjs";

const boundedFacts = {
  sharedSemanticBoundary: false,
  consumerFamilies: 1,
  executionModes: 1,
  graphTraversal: false,
  materialUnknown: false,
};

for (const { label, facts, expected } of [
  {
    label: "shared semantic boundary",
    facts: { ...boundedFacts, sharedSemanticBoundary: true },
    expected: { minimumRisk: "high", reasons: ["shared-semantic-boundary"] },
  },
  {
    label: "multiple execution modes",
    facts: { ...boundedFacts, executionModes: 2 },
    expected: { minimumRisk: "high", reasons: ["multiple-execution-modes"] },
  },
  {
    label: "graph traversal",
    facts: { ...boundedFacts, graphTraversal: true },
    expected: { minimumRisk: "high", reasons: ["graph-traversal"] },
  },
  {
    label: "material uncertainty",
    facts: { ...boundedFacts, materialUnknown: true },
    expected: { minimumRisk: "high", reasons: ["material-uncertainty"] },
  },
  {
    label: "bounded facts",
    facts: boundedFacts,
    expected: { minimumRisk: null, reasons: [] },
  },
]) {
  test(`derives the risk floor for ${label}`, () => {
    assert.deepEqual(deriveRiskFloorFromFacts(facts), expected);
  });
}
