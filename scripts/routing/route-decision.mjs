import { createHash } from "node:crypto";

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

const playbooks = Object.freeze({
  investigation: "skill://ompstack/playbooks/investigation.md",
  "bug-fix": "skill://ompstack/playbooks/bug-fix.md",
  feature: "skill://ompstack/playbooks/feature.md",
  refactoring: "skill://ompstack/playbooks/refactoring.md",
  prototype: "skill://ompstack/playbooks/prototype.md",
  "perf-issue": "skill://ompstack/playbooks/perf-issue.md",
  "runtime-forensics": "skill://ompstack/playbooks/runtime-forensics.md",
  "trace-forensics": "skill://ompstack/playbooks/trace-forensics.md",
  eval: "skill://ompstack/playbooks/eval.md",
});

/** Creates an immutable decision bound to normalized inputs and a measured working-tree snapshot. */
export function createRouteDecision({ intent, measurementPurpose, targets, repositoryRoot, scratchPaths = [], changeSetDigest, classification, signals, graph, policyVersion, routeInputDigest, declaredRiskFacts = {}, measuredRisk = classification?.risk, reservedRisk = measuredRisk, reservationReasons = [] }) {
  const requiredPlaybook = playbooks[intent];
  const riskRank = { low: 0, medium: 1, high: 2, critical: 3 };
  const riskNames = Object.keys(riskRank);
  const effectiveRisk = riskNames.includes(measuredRisk) && riskNames.includes(reservedRisk)
    ? (riskRank[measuredRisk] >= riskRank[reservedRisk] ? measuredRisk : reservedRisk)
    : null;
  if (typeof intent !== "string" || requiredPlaybook === undefined || !["bootstrap", "material"].includes(measurementPurpose) || !Array.isArray(targets) || targets.length === 0 || !targets.every((target) => typeof target === "string" && target !== "") || !Array.isArray(scratchPaths) || !scratchPaths.every((path) => typeof path === "string" && path !== "") || typeof repositoryRoot !== "string" || repositoryRoot === "" || !/^[a-f0-9]{64}$/.test(changeSetDigest) || !classification || !signals || !graph || typeof policyVersion !== "string" || policyVersion === "" || !/^[a-f0-9]{64}$/.test(routeInputDigest) || effectiveRisk === null || !Array.isArray(reservationReasons) || !reservationReasons.every((reason) => typeof reason === "string" && reason !== "")) throw new Error("route decision: input has an invalid shape");
  const signalsDigest = createHash("sha256").update(stable({ signals, graph })).digest("hex");
  const riskBudget = Object.freeze({
    measured: measuredRisk,
    reserved: reservedRisk,
    effective: effectiveRisk,
    reservationReasons: Object.freeze([...reservationReasons]),
  });
  const body = {
    schemaVersion: 2,
    policyVersion,
    routeInputDigest,
    changeSetDigest,
    measurementPurpose,
    repositoryRoot,
    targets: Object.freeze([...targets]),
    scratchPaths: Object.freeze([...scratchPaths]),
    risk: effectiveRisk,
    measuredRisk,
    riskBudget,
    requiredPlaybooks: Object.freeze([requiredPlaybook]),
    requiredIndependentEvidence: Object.freeze(effectiveRisk === "low" ? [] : effectiveRisk === "medium" ? ["verifier"] : ["reviewer", "verifier", ...(effectiveRisk === "critical" || classification.securityReviewRequired ? ["security-reviewer"] : [])]),
    securityReviewRequired: effectiveRisk === "critical" || classification.securityReviewRequired,
    verificationRequired: effectiveRisk !== "low",
    signalsDigest,
    signals: Object.freeze({ ...signals, graph: Object.freeze({ ...graph }) }),
    reasonCodes: Object.freeze([...classification.reasonCodes, ...reservationReasons]),
  };
  return Object.freeze({ ...body, declaredRiskFacts: Object.freeze({ ...declaredRiskFacts }), decisionId: createHash("sha256").update(stable(body)).digest("hex") });
}
