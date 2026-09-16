import assert from "node:assert/strict";
import { test } from "bun:test";
import { classifyRoute } from "../scripts/routing/classify-route.mjs";
import { createRouteDecision } from "../scripts/routing/route-decision.mjs";

const signals = { changedCodeFiles: 1, changedLines: 1, unclassifiedChangedFiles: 0, touchesAuth: "unknown", touchesAuthorization: "unknown", touchesCryptoOrSecrets: "unknown", touchesTenantIsolation: "unknown", touchesMoneyMovement: "unknown", touchesMigration: "unknown", destructiveMigration: "unknown", touchesRuntimeConfig: "unknown", touchesPublicAPI: "unknown", touchesPersistence: "unknown", touchesConcurrency: "unknown", touchesGeneratedCode: "unknown", touchesExposedParser: "unknown" };
const graph = { materialUnknown: false, affectedModuleCount: 1, reverseDependentCount: 0 };
const facts = { sharedSemanticBoundary: false, consumerFamilies: 1, executionModes: 1, graphTraversal: false, materialUnknown: false };
const policy = { thresholds: { maxMediumCodeFiles: 5, maxMediumChangedLines: 300, maxMediumAffectedModules: 2, maxMediumReverseDependents: 12 } };
const knownSignals = {
  ...signals,
  touchesAuth: false,
  touchesAuthorization: false,
  touchesCryptoOrSecrets: false,
  touchesTenantIsolation: false,
  touchesMoneyMovement: false,
  touchesMigration: false,
  destructiveMigration: false,
  touchesRuntimeConfig: false,
  touchesPublicAPI: false,
  touchesPersistence: false,
  touchesConcurrency: false,
  touchesGeneratedCode: false,
  touchesExposedParser: false,
};


test("unknown signals fail closed and decisions are stable", () => {
  const classification = classifyRoute({ signals, graph, taskFacts: { behaviorAffecting: true }, riskFacts: facts, policy });
  assert.equal(classification.risk, "high");
  const input = { intent: "feature", measurementPurpose: "material", targets: ["src/example.ts"], repositoryRoot: "/repo", changeSetDigest: "1".repeat(64), classification, signals, graph, policyVersion: "1", routeInputDigest: "0".repeat(64) };
  const left = createRouteDecision(input);
  const right = createRouteDecision(input);
  assert.equal(left.decisionId, right.decisionId);
  assert.equal(left.signalsDigest, right.signalsDigest);
  assert.ok(Object.isFrozen(left));
  assert.deepEqual(left.requiredPlaybooks, ["skill://ompstack/playbooks/feature.md"]);
  assert.equal(left.changeSetDigest, "1".repeat(64));
  assert.equal(left.measurementPurpose, "material");
});

test("partial graph limits blast-radius confidence without escalating risk", () => {
  const classification = classifyRoute({
    signals: knownSignals,
    graph: { ...graph, materialUnknown: true },
    taskFacts: { behaviorAffecting: true },
    riskFacts: facts,
    policy,
  });
  assert.equal(classification.risk, "medium");
  assert.deepEqual(classification.reasonCodes, []);
});


test("thresholds retain medium risk with a warning", () => {
  const classification = classifyRoute({
    signals: { ...knownSignals, changedCodeFiles: 6 },
    graph: { ...graph, affectedModuleCount: 3 },
    taskFacts: { behaviorAffecting: false },
    riskFacts: facts,
    policy,
  });
  assert.equal(classification.risk, "medium");
  assert.deepEqual(classification.reasonCodes, ["threshold:code-files", "threshold:affected-modules"]);
});

test("confirmed auth surface is critical", () => {
  const classification = classifyRoute({ signals: { ...signals, touchesAuth: true }, graph, taskFacts: { behaviorAffecting: true }, riskFacts: facts, policy });
  assert.equal(classification.risk, "critical");
  assert.equal(classification.securityReviewRequired, true);
});

test("confirmed exposed parser is critical", () => {
  const classification = classifyRoute({ signals: { ...signals, touchesExposedParser: true }, graph, taskFacts: { behaviorAffecting: true }, riskFacts: facts, policy });
  assert.equal(classification.risk, "critical");
  assert.equal(classification.securityReviewRequired, true);
});

test("classifier retains simultaneous routing reasons", () => {
  const classification = classifyRoute({
    signals: { ...signals, unclassifiedChangedFiles: 1, changedCodeFiles: 6 },
    graph: { ...graph, materialUnknown: true, affectedModuleCount: 3 },
    taskFacts: { behaviorAffecting: true },
    riskFacts: { ...facts, sharedSemanticBoundary: true },
    policy,
  });
  assert.deepEqual(classification.reasonCodes, [
    "uncertainty:unknown-signals",
    "uncertainty:unclassified-changes",
    "floor:shared-semantic-boundary",
    "threshold:code-files",
    "threshold:affected-modules",
  ]);
});
