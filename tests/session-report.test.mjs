import assert from "node:assert/strict";
import { test } from "bun:test";
import { formatSessionReport, parseSessionReport } from "../scripts/session-report.mjs";

const prefix = "io.github.chithang-50cent.ompstack.";
const decisionId = "a".repeat(64);
const nextDecisionId = "b".repeat(64);

function custom(customType, data) {
  return JSON.stringify({ type: "custom", customType: `${prefix}${customType}`, data });
}

test("session report parses route, block, skip, evidence, and stale entries", () => {
  const session = [
    JSON.stringify({ type: "session", id: "session" }),
    custom("route-activation.v1", { workflow: "ompstack", source: "input" }),
    custom("route-decision.v1", {
      decisionId,
      risk: "high",
      targets: ["sympy/combinatorics"],
      declaredRiskFacts: { materialUnknown: true, consumerFamilies: 2 },
      requiredIndependentEvidence: ["reviewer", "verifier"],
      measurementPurpose: "material",
    }),
    custom("route-decision-state.v1", { decisionId, state: "invalidated", reason: "superseded-by-fresh-route" }),
    custom("route-decision.v1", {
      decisionId: nextDecisionId,
      risk: "high",
      targets: ["tests"],
      declaredRiskFacts: { materialUnknown: false },
      requiredIndependentEvidence: ["reviewer", "verifier", "security-reviewer"],
      measurementPurpose: "material",
    }),
    custom("route-block.v1", {
      toolName: "edit",
      reason: "ompstack target is outside the RouteDecision scope: README.md",
      decisionId: nextDecisionId,
      path: "README.md",
    }),
    custom("route-skip.v1", { reason: "enforcement-inactive", firstToolName: "write" }),
    custom("route-evidence.v1", { decisionId: nextDecisionId, evidence: "reviewer" }),
    custom("route-evidence.v1", { decisionId: nextDecisionId, evidence: "verifier" }),
    custom("route-decision-state.v1", { decisionId: nextDecisionId, state: "material-stale", reason: "workspace-mutation-after-route" }),
  ].join("\n");

  const report = parseSessionReport(session);
  assert.equal(report.activation, "input");
  assert.deepEqual(report.activationSources, ["input"]);
  assert.equal(report.routeCalls.length, 2);
  assert.equal(report.routeCalls[0].reason, "superseded-by-fresh-route");
  assert.deepEqual(report.routeCalls[0].riskFacts, { materialUnknown: true, consumerFamilies: 2 });
  assert.equal(report.blocks.length, 1);
  assert.deepEqual(report.blocks[0], {
    toolName: "edit",
    reason: "ompstack target is outside the RouteDecision scope: README.md",
    decisionId: nextDecisionId,
    path: "README.md",
  });
  assert.deepEqual(report.skips, [{ reason: "enforcement-inactive", firstToolName: "write" }]);
  assert.deepEqual(report.evidence, {
    decisionId: nextDecisionId,
    required: ["reviewer", "verifier", "security-reviewer"],
    observed: ["reviewer", "verifier"],
    missing: ["security-reviewer"],
    lanes: ["reviewer", "verifier", "security-reviewer"],
  });
  assert.equal(report.materialStale, 1);

  const text = formatSessionReport(report);
  assert.match(text, /activation\s+: input/);
  assert.match(text, /route calls\s+: 2/);
  assert.match(text, /riskFacts=\{consumerFamilies:2,materialUnknown:true\}/);
  assert.match(text, /skips\s+: 1  \(enforcement-inactive, first tool: write\)/);
  assert.match(text, /evidence\s+: reviewer ✓ verifier ✓ security-reviewer ✗/);
  assert.match(text, /material stale\s+: 1/);
});

test("session report distinguishes absent activation from legacy unknown source", () => {
  const absent = parseSessionReport(JSON.stringify({ type: "session", id: "session" }));
  assert.equal(absent.activation, null);
  assert.deepEqual(absent.activationSources, []);
  assert.match(formatSessionReport(absent), /activation\s+: \(không có\)/);

  const legacy = parseSessionReport([
    JSON.stringify({ type: "session", id: "session" }),
    custom("route-activation.v1", { workflow: "ompstack" }),
  ].join("\n"));
  assert.equal(legacy.activation, "unknown");
  assert.deepEqual(legacy.activationSources, [null]);
  assert.match(formatSessionReport(legacy), /activation\s+: \(không rõ source\)/);
});

test("session report normalizes the ompstack-verifier alias", () => {
  const report = parseSessionReport([
    JSON.stringify({ type: "session", id: "session" }),
    custom("route-decision.v1", {
      decisionId,
      requiredIndependentEvidence: ["ompstack-verifier"],
    }),
    custom("route-evidence.v1", { decisionId, evidence: "ompstack-verifier" }),
  ].join("\n"));

  assert.deepEqual(report.evidence, {
    decisionId,
    required: ["verifier"],
    observed: ["verifier"],
    missing: [],
    lanes: ["verifier"],
  });
  assert.match(formatSessionReport(report), /evidence\s+: verifier ✓/);
});

test("session report rejects malformed JSONL with its line number", () => {
  assert.throws(() => parseSessionReport('{"type":"session"}\nnot-json'), /session JSONL line 2 is not JSON/);
});
