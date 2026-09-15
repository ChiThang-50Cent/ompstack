import assert from "node:assert/strict";
import { test } from "bun:test";
import { classifyRoute } from "../scripts/routing/classify-route.mjs";
import { createRouteDecision } from "../scripts/routing/route-decision.mjs";

const signals = { changedCodeFiles: 1, changedLines: 1, unclassifiedChangedFiles: 0, touchesAuth: "unknown", touchesAuthorization: "unknown", touchesCryptoOrSecrets: "unknown", touchesTenantIsolation: "unknown", touchesMoneyMovement: "unknown", touchesMigration: "unknown", destructiveMigration: "unknown", touchesRuntimeConfig: "unknown", touchesPublicAPI: "unknown", touchesPersistence: "unknown", touchesConcurrency: "unknown", touchesGeneratedCode: "unknown" };
const graph = { materialUnknown: false, affectedModuleCount: 1, reverseDependentCount: 0 };
const facts = { sharedSemanticBoundary: false, consumerFamilies: 1, executionModes: 1, graphTraversal: false, materialUnknown: false };
const policy = { thresholds: { maxMediumCodeFiles: 5, maxMediumChangedLines: 300, maxMediumAffectedModules: 1, maxMediumReverseDependents: 12 } };

test("unknown signals fail closed and decisions are stable", () => {
  const classification = classifyRoute({ signals, graph, taskFacts: { behaviorAffecting: true }, riskFacts: facts, policy });
  assert.equal(classification.risk, "high");
  const input = { intent: "feature", classification, signals, graph, policyVersion: "1" };
  const left = createRouteDecision(input);
  const right = createRouteDecision(input);
  assert.equal(left.decisionId, right.decisionId);
  assert.equal(left.signalsDigest, right.signalsDigest);
  assert.ok(Object.isFrozen(left));
});

test("confirmed auth surface is critical", () => {
  const classification = classifyRoute({ signals: { ...signals, touchesAuth: true }, graph, taskFacts: { behaviorAffecting: true }, riskFacts: facts, policy });
  assert.equal(classification.risk, "critical");
  assert.equal(classification.securityReviewRequired, true);
});
