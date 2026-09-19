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
export function createRouteDecision({ intent, measurementPurpose, targets, repositoryRoot, changeSetDigest, classification, signals, graph, policyVersion, routeInputDigest, declaredRiskFacts = {} }) {
  const requiredPlaybook = playbooks[intent];
  if (typeof intent !== "string" || requiredPlaybook === undefined || !["bootstrap", "material"].includes(measurementPurpose) || !Array.isArray(targets) || targets.length === 0 || !targets.every((target) => typeof target === "string" && target !== "") || typeof repositoryRoot !== "string" || repositoryRoot === "" || !/^[a-f0-9]{64}$/.test(changeSetDigest) || !classification || !signals || !graph || typeof policyVersion !== "string" || policyVersion === "" || !/^[a-f0-9]{64}$/.test(routeInputDigest)) throw new Error("route decision: input has an invalid shape");
  const signalsDigest = createHash("sha256").update(stable({ signals, graph })).digest("hex");
  const body = {
    schemaVersion: 2,
    policyVersion,
    routeInputDigest,
    changeSetDigest,
    measurementPurpose,
    repositoryRoot,
    targets: Object.freeze([...targets]),
    intent,
    risk: classification.risk,
    declaredRiskFacts: Object.freeze({ ...declaredRiskFacts }),
    requiredPlaybooks: Object.freeze([requiredPlaybook]),
    requiredIndependentEvidence: Object.freeze(classification.risk === "low" ? [] : classification.risk === "medium" ? ["verifier"] : ["reviewer", "verifier", ...(classification.securityReviewRequired ? ["security-reviewer"] : [])]),
    securityReviewRequired: classification.securityReviewRequired,
    verificationRequired: classification.verificationRequired,
    signalsDigest,
    signals: Object.freeze({ ...signals, graph: Object.freeze({ ...graph }) }),
    reasonCodes: classification.reasonCodes,
  };
  return Object.freeze({ ...body, decisionId: createHash("sha256").update(stable(body)).digest("hex") });
}
