// @ts-check

export const ROUTING_ERROR_CODES = Object.freeze({
  MALFORMED_INPUT: "MALFORMED_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  UNKNOWN_ENUM_VALUE: "UNKNOWN_ENUM_VALUE",
  MALFORMED_EVIDENCE_BLOCK: "MALFORMED_EVIDENCE_BLOCK",
  RISK_FACTS_REQUIRE_HIGH: "RISK_FACTS_REQUIRE_HIGH",
  HIGH_REQUIRES_DUAL_EVIDENCE: "HIGH_REQUIRES_DUAL_EVIDENCE",
  DUPLICATE_CASE_ID: "DUPLICATE_CASE_ID",
  CORPUS_COVERAGE_MISSING: "CORPUS_COVERAGE_MISSING",
  REQUIRED_CASE_MISSING: "REQUIRED_CASE_MISSING",
  FIXTURE_RELATION_MISMATCH: "FIXTURE_RELATION_MISMATCH",
  MALFORMED_CORPUS: "MALFORMED_CORPUS",
  EVIDENCE_FLOOR_MAPPING_MISMATCH: "EVIDENCE_FLOOR_MAPPING_MISMATCH",
  EVIDENCE_FLOOR_SCOPE_MISMATCH: "EVIDENCE_FLOOR_SCOPE_MISMATCH",
  EVIDENCE_WAIVER_MISSING: "EVIDENCE_WAIVER_MISSING",
  CONTRACT_INELIGIBILITY_UNEXPLAINED: "CONTRACT_INELIGIBILITY_UNEXPLAINED",
  LOW_DEFERRED_INVALID: "LOW_DEFERRED_INVALID",
  DERIVATION_REQUIRED_MISSING: "DERIVATION_REQUIRED_MISSING",
  RISK_TIER_BASIS_MISMATCH: "RISK_TIER_BASIS_MISMATCH",
  RECONSTRUCTION_POLICY_INVALID: "RECONSTRUCTION_POLICY_INVALID",
  RECONSTRUCTION_CASE_MISSING: "RECONSTRUCTION_CASE_MISSING",
  RECONSTRUCTION_EVIDENCE_MISSING: "RECONSTRUCTION_EVIDENCE_MISSING",
});

const routes = new Set(["investigation", "bug-fix", "feature", "refactoring", "prototype", "perf-issue", "runtime-forensics", "trace-forensics", "eval"]);
const risks = new Set(["low", "medium", "high", "critical"]);
const independentEvidence = new Set(["none", "reviewer", "verifier", "reviewer + verifier", "security-reviewer", "reviewer + verifier + security-reviewer"]);
const floors = new Set(["not-applicable", "self-reported", "parent-reexecuted", "contract-executed"]);
const topologies = new Set(["direct", "deferred"]);
const bases = new Set(["impact", "deferred-floor"]);
const derivations = new Set(["required", "not-required"]);
const reconstructionTriggers = new Set([
  "high-critical-default",
  "medium-requirement-evolution",
  "not-eligible",
]);
const evolutionEvidenceReference = /^(?:user turn \d+:|turn:\d+(?::|$)|spec(?:ification)?:\S|artifact:\S|(?:local|agent|artifact):\/\/\S)/i;

const error = (code, path, message) => ({ code, path, message });
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const string = (value) => typeof value === "string" && value.trim() !== "";
const verificationPhase = (expected) => Array.isArray(expected.phases) && expected.phases.includes("verification");
const highFromFacts = (facts) => facts.sharedSemanticBoundary || facts.executionModes > 1 || facts.graphTraversal || facts.materialUnknown;

function validateReconstruction(expected, errors) {
  const reconstruction = expected.reconstruction;
  if (reconstruction === undefined) {
    if (["medium", "high", "critical"].includes(expected.risk)) {
      errors.push(error(ROUTING_ERROR_CODES.RECONSTRUCTION_POLICY_INVALID, "expected.reconstruction", "Medium, High, and Critical work must record a reconstruction decision"));
    }
    return;
  }
  if (
    !object(reconstruction) ||
    typeof reconstruction.enabled !== "boolean" ||
    !reconstructionTriggers.has(reconstruction.trigger) ||
    !Array.isArray(reconstruction.evidence) ||
    !reconstruction.evidence.every(string) ||
    typeof reconstruction.requirementEvolution !== "boolean"
  ) {
    errors.push(error(ROUTING_ERROR_CODES.RECONSTRUCTION_POLICY_INVALID, "expected.reconstruction", "reconstruction has an invalid shape"));
    return;
  }

  const isMedium = expected.risk === "medium";
  const highCritical = ["high", "critical"].includes(expected.risk);
  if (highCritical) {
    if (
      !reconstruction.enabled ||
      reconstruction.trigger !== "high-critical-default" ||
      (reconstruction.requirementEvolution && (
        reconstruction.evidence.length === 0 ||
        !reconstruction.evidence.every((entry) => evolutionEvidenceReference.test(entry))
      )) ||
      (!reconstruction.requirementEvolution && reconstruction.evidence.length !== 0)
    ) {
      errors.push(error(ROUTING_ERROR_CODES.RECONSTRUCTION_POLICY_INVALID, "expected.reconstruction", "High/Critical reconstruction is enabled by default and any evolution must carry exact evidence"));
    }
    return;
  }

  if (isMedium && reconstruction.requirementEvolution === true) {
    if (
      !reconstruction.enabled ||
      reconstruction.trigger !== "medium-requirement-evolution" ||
      reconstruction.evidence.length === 0 ||
      !reconstruction.evidence.every((entry) => evolutionEvidenceReference.test(entry))
    ) {
      errors.push(error(ROUTING_ERROR_CODES.RECONSTRUCTION_EVIDENCE_MISSING, "expected.reconstruction", "evolved Medium requirements need exact evidence and reconstruction"));
    }
    return;
  }

  if (
    reconstruction.enabled ||
    reconstruction.trigger !== "not-eligible" ||
    reconstruction.evidence.length !== 0 ||
    reconstruction.requirementEvolution !== false
  ) {
    errors.push(error(ROUTING_ERROR_CODES.RECONSTRUCTION_POLICY_INVALID, "expected.reconstruction", "non-evolved Medium and non-Medium work are not reconstruction eligible"));
  }
}

export function validateRoutingCase(routingCase) {
  const errors = [];
  if (!object(routingCase)) return [error(ROUTING_ERROR_CODES.MALFORMED_INPUT, "", "routing case must be an object")];
  for (const key of ["id", "prompt", "expected"]) {
    if (!(key in routingCase)) errors.push(error(ROUTING_ERROR_CODES.MISSING_REQUIRED_FIELD, key, `${key} is required`));
  }
  if (!object(routingCase.expected)) return [...errors, error(ROUTING_ERROR_CODES.MISSING_REQUIRED_FIELD, "expected", "expected must be an object")];
  const expected = routingCase.expected;
  for (const key of ["route", "overlays", "phases", "progressTracking", "risk", "proofTopology", "riskTierBasis", "contractDerivation", "proofSurface", "writeOwnership", "independentEvidence", "evidence"]) {
    if (!(key in expected)) errors.push(error(ROUTING_ERROR_CODES.MISSING_REQUIRED_FIELD, `expected.${key}`, `${key} is required`));
  }
  if (!string(routingCase.id) || !string(routingCase.prompt)) errors.push(error(ROUTING_ERROR_CODES.MISSING_REQUIRED_FIELD, "id/prompt", "id and prompt must be non-empty strings"));
  if (!routes.has(expected.route) || !risks.has(expected.risk) || !topologies.has(expected.proofTopology) || !bases.has(expected.riskTierBasis) || !derivations.has(expected.contractDerivation) || !independentEvidence.has(expected.independentEvidence) || !["none", "native todo"].includes(expected.progressTracking)) {
    errors.push(error(ROUTING_ERROR_CODES.UNKNOWN_ENUM_VALUE, "expected", "expected contains an unsupported enum value"));
  }
  if (!Array.isArray(expected.overlays) || !expected.overlays.every((item) => item === "queue") || new Set(expected.overlays).size !== expected.overlays.length) errors.push(error(ROUTING_ERROR_CODES.UNKNOWN_ENUM_VALUE, "expected.overlays", "overlays must contain unique supported overlays"));
  if (!Array.isArray(expected.phases) || !expected.phases.every((item) => item === "verification") || new Set(expected.phases).size !== expected.phases.length) errors.push(error(ROUTING_ERROR_CODES.UNKNOWN_ENUM_VALUE, "expected.phases", "phases must contain unique supported phases"));
  for (const key of ["proofSurface", "writeOwnership"]) if (!string(expected[key])) errors.push(error(ROUTING_ERROR_CODES.MISSING_REQUIRED_FIELD, `expected.${key}`, `${key} must be non-empty`));
  const evidence = expected.evidence;
  if (!object(evidence) || !floors.has(evidence.floor) || typeof evidence.reExecutable !== "boolean" || typeof evidence.contractEligible !== "boolean" || (evidence.waiver !== undefined && !string(evidence.waiver)) || (evidence.contractIneligibilityReason !== undefined && !string(evidence.contractIneligibilityReason))) {
    errors.push(error(ROUTING_ERROR_CODES.MALFORMED_EVIDENCE_BLOCK, "expected.evidence", "evidence has an invalid shape"));
  } else {
    const hasVerification = verificationPhase(expected);
    if ((hasVerification && evidence.floor === "not-applicable") || (!hasVerification && evidence.floor !== "not-applicable")) errors.push(error(ROUTING_ERROR_CODES.EVIDENCE_FLOOR_SCOPE_MISMATCH, "expected.evidence.floor", "floor must match verification scope"));
    if (hasVerification && !evidence.reExecutable && !string(evidence.waiver)) errors.push(error(ROUTING_ERROR_CODES.EVIDENCE_WAIVER_MISSING, "expected.evidence.waiver", "non-re-executable evidence needs a waiver"));
    if (["high", "critical"].includes(expected.risk) && !evidence.contractEligible && !string(evidence.contractIneligibilityReason)) errors.push(error(ROUTING_ERROR_CODES.CONTRACT_INELIGIBILITY_UNEXPLAINED, "expected.evidence.contractIneligibilityReason", "ineligible High/Critical contract needs a reason"));
    const expectedFloor = !hasVerification ? "not-applicable" : !evidence.reExecutable ? "self-reported" : evidence.contractEligible ? "contract-executed" : "parent-reexecuted";
    if (evidence.floor !== expectedFloor) errors.push(error(ROUTING_ERROR_CODES.EVIDENCE_FLOOR_MAPPING_MISMATCH, "expected.evidence.floor", "floor does not match evidence policy"));
  }
  if (expected.risk === "low" && expected.proofTopology === "deferred") errors.push(error(ROUTING_ERROR_CODES.LOW_DEFERRED_INVALID, "expected.proofTopology", "Low risk cannot use deferred topology"));
  if ((["high", "critical"].includes(expected.risk) || (expected.risk === "medium" && expected.proofTopology === "deferred")) && expected.contractDerivation !== "required") errors.push(error(ROUTING_ERROR_CODES.DERIVATION_REQUIRED_MISSING, "expected.contractDerivation", "topology requires contract derivation"));
  if (expected.riskTierBasis === "deferred-floor" && (expected.proofTopology !== "deferred" || expected.risk !== "medium")) errors.push(error(ROUTING_ERROR_CODES.RISK_TIER_BASIS_MISMATCH, "expected.riskTierBasis", "deferred-floor applies only to Medium deferred routes"));
  validateReconstruction(expected, errors);
  if (routingCase.riskFacts !== undefined) {
    const facts = routingCase.riskFacts;
    if (!object(facts) || typeof facts.sharedSemanticBoundary !== "boolean" || typeof facts.graphTraversal !== "boolean" || typeof facts.materialUnknown !== "boolean" || !Number.isInteger(facts.consumerFamilies) || !Number.isInteger(facts.executionModes)) {
      errors.push(error(ROUTING_ERROR_CODES.MALFORMED_INPUT, "riskFacts", "riskFacts has an invalid shape"));
    } else if (highFromFacts(facts)) {
      if (!["high", "critical"].includes(expected.risk)) errors.push(error(ROUTING_ERROR_CODES.RISK_FACTS_REQUIRE_HIGH, "expected.risk", "risk facts require High or Critical"));
      const lanes = expected.independentEvidence.split("+").map((lane) => lane.trim());
      if (!["reviewer", "verifier"].every((lane) => lanes.includes(lane))) errors.push(error(ROUTING_ERROR_CODES.HIGH_REQUIRES_DUAL_EVIDENCE, "expected.independentEvidence", "risk facts require reviewer and verifier"));
    }
  }
  return errors;
}

export function validateRoutingCorpus(cases) {
  if (!Array.isArray(cases)) return [error(ROUTING_ERROR_CODES.MALFORMED_CORPUS, "", "routing corpus must be an array")];
  const errors = [];
  const ids = new Set();
  for (const item of cases) {
    if (object(item) && string(item.id)) {
      if (ids.has(item.id)) errors.push(error(ROUTING_ERROR_CODES.DUPLICATE_CASE_ID, item.id, "case id must be unique"));
      ids.add(item.id);
    }
  }
  if (cases.length < 18) errors.push(error(ROUTING_ERROR_CODES.CORPUS_COVERAGE_MISSING, "", "routing corpus needs at least eighteen cases"));
  for (const id of ["read-only-explanation", "multi-phase-progress-tracking", "independent-package-queue", "doctor-blocked-runtime", "shared-normalization-boundary", "shared-normalization-domain-twin", "contract-executed-gate", "deferred-floor-promotion"]) if (!ids.has(id)) errors.push(error(ROUTING_ERROR_CODES.REQUIRED_CASE_MISSING, id, "required routing case is missing"));
  const left = cases.find((item) => item?.id === "shared-normalization-boundary");
  const right = cases.find((item) => item?.id === "shared-normalization-domain-twin");
  if (left && right && JSON.stringify(left.riskFacts) !== JSON.stringify(right.riskFacts)) errors.push(error(ROUTING_ERROR_CODES.FIXTURE_RELATION_MISMATCH, "riskFacts", "normalization twins must share risk facts"));
  return errors;
}

export function validateReconstructionRoutingCorpus(cases) {
  if (!Array.isArray(cases)) return [error(ROUTING_ERROR_CODES.MALFORMED_CORPUS, "", "routing corpus must be an array")];
  const errors = [];
  const requiredCases = [
    "critical-authz-change",
    "shared-normalization-boundary",
    "bounded-local-normalization-control",
    "medium-evolved-reconstruction",
  ];
  for (const routingCase of cases) validateReconstruction(routingCase?.expected ?? {}, errors);
  for (const id of requiredCases) {
    const routingCase = cases.find((item) => item?.id === id);
    if (!routingCase) {
      errors.push(error(ROUTING_ERROR_CODES.RECONSTRUCTION_CASE_MISSING, id, "required reconstruction routing case is missing"));
    }
  }
  return errors;
}
