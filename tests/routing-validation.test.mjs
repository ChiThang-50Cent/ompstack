import assert from "node:assert/strict";
import { test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  validateReconstructionRoutingCorpus,
  validateRoutingCase,
  validateRoutingCorpus,
} from "../scripts/routing-validation.mjs";

const valid = {
  id: "valid", prompt: "Verify a bounded change.",
  expected: { route: "feature", overlays: [], phases: ["verification"], progressTracking: "none", risk: "medium", proofTopology: "direct", riskTierBasis: "impact", contractDerivation: "not-required", proofSurface: "command", writeOwnership: "parent", independentEvidence: "verifier", evidence: { floor: "parent-reexecuted", reExecutable: true, contractEligible: false }, reconstruction: { enabled: false, trigger: "not-eligible", requirementEvolution: false, evidence: [] } },
};

const realCases = JSON.parse(
  readFileSync(new URL("./fixtures/routing-cases.json", import.meta.url), "utf8"),
);

test("routing validator returns structured errors instead of throwing", () => {
  assert.deepEqual(validateRoutingCase(null).map((item) => item.code), ["MALFORMED_INPUT"]);
  assert.ok(validateRoutingCase({}).some((item) => item.code === "MISSING_REQUIRED_FIELD"));
});

test("reconstruction permits evolved Medium work only with evidence", () => {
  const evolved = structuredClone(valid);
  evolved.expected.reconstruction = {
    enabled: true,
    trigger: "medium-requirement-evolution",
    requirementEvolution: true,
    evidence: ["user turn 2: changed compatibility requirement"],
  };
  assert.deepEqual(validateRoutingCase(evolved), []);

  evolved.expected.reconstruction.evidence = [];
  assert.ok(
    validateRoutingCase(evolved).some(
      (item) => item.code === "RECONSTRUCTION_EVIDENCE_MISSING",
    ),
  );

  evolved.expected.reconstruction.evidence = ["x"];
  assert.ok(
    validateRoutingCase(evolved).some(
      (item) => item.code === "RECONSTRUCTION_EVIDENCE_MISSING",
    ),
  );
});

test("the production routing corpus satisfies its declared schema", () => {
  for (const routingCase of realCases) {
    assert.deepEqual(validateRoutingCase(routingCase), [], routingCase.id);
  }
  assert.deepEqual(validateRoutingCorpus(realCases), []);
  assert.deepEqual(validateReconstructionRoutingCorpus(realCases), []);
  assert.equal(realCases.length, 38);
});

test("routing validator requires Medium and higher reconstruction decisions", () => {
  const missing = structuredClone(valid);
  delete missing.expected.reconstruction;
  assert.ok(
    validateRoutingCase(missing).some(
      (item) => item.code === "RECONSTRUCTION_POLICY_INVALID",
    ),
  );
});

test("routing topology and evidence rules reject invalid routes", () => {
  assert.deepEqual(validateRoutingCase(valid), []);
  const lowDeferred = structuredClone(valid);
  lowDeferred.expected.risk = "low";
  lowDeferred.expected.proofTopology = "deferred";
  assert.ok(validateRoutingCase(lowDeferred).some((item) => item.code === "LOW_DEFERRED_INVALID"));
  const high = structuredClone(valid);
  high.expected.risk = "high";
  high.expected.evidence.contractIneligibilityReason = "no adapter";
  high.expected.contractDerivation = "not-required";
  assert.ok(validateRoutingCase(high).some((item) => item.code === "DERIVATION_REQUIRED_MISSING"));
});

test("High and Critical ineligible contracts need a reason without verification", () => {
  const highWithoutVerification = structuredClone(valid);
  highWithoutVerification.expected.risk = "high";
  highWithoutVerification.expected.phases = [];
  highWithoutVerification.expected.contractDerivation = "required";
  highWithoutVerification.expected.evidence = {
    floor: "not-applicable",
    reExecutable: false,
    contractEligible: false,
  };
  highWithoutVerification.expected.reconstruction = {
    enabled: true,
    trigger: "high-critical-default",
    requirementEvolution: false,
    evidence: [],
  };
  assert.ok(
    validateRoutingCase(highWithoutVerification).some(
      (item) => item.code === "CONTRACT_INELIGIBILITY_UNEXPLAINED",
    ),
  );
});

test("routing corpus separates duplicate corpus failures", () => {
  const corpus = Array.from({ length: 18 }, (_, index) => ({ ...structuredClone(valid), id: `case-${index}` }));
  assert.ok(validateRoutingCorpus(corpus).some((item) => item.code === "REQUIRED_CASE_MISSING"));
  corpus.push({ ...structuredClone(valid), id: "case-0" });
  assert.ok(validateRoutingCorpus(corpus).some((item) => item.code === "DUPLICATE_CASE_ID"));
});
test("reconstruction corpus requires every trigger control", () => {
  const cases = [
    {
      id: "critical-authz-change",
      expected: {
        risk: "critical",
        reconstruction: {
          enabled: true,
          trigger: "high-critical-default",
          requirementEvolution: false,
          evidence: [],
        },
      },
    },
  ];
  assert.ok(
    validateReconstructionRoutingCorpus(cases).some(
      (item) => item.code === "RECONSTRUCTION_CASE_MISSING",
    ),
  );
});
