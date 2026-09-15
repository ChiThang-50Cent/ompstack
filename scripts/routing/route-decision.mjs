import { createHash } from "node:crypto";

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Creates an immutable, content-addressed routing decision. */
export function createRouteDecision({ intent, classification, signals, graph, policyVersion }) {
  if (typeof intent !== "string" || intent === "" || !classification || !signals || !graph || typeof policyVersion !== "string" || policyVersion === "") throw new Error("route decision: input has an invalid shape");
  const signalsDigest = createHash("sha256").update(stable({ signals, graph })).digest("hex");
  const body = {
    schemaVersion: 1,
    policyVersion,
    intent,
    risk: classification.risk,
    requiredPlaybooks: Object.freeze([]),
    requiredIndependentEvidence: Object.freeze(classification.risk === "low" ? [] : classification.risk === "medium" ? ["verifier"] : ["reviewer", "verifier", ...(classification.securityReviewRequired ? ["security-reviewer"] : [])]),
    securityReviewRequired: classification.securityReviewRequired,
    verificationRequired: classification.verificationRequired,
    signalsDigest,
    signals: Object.freeze({ ...signals, graph: Object.freeze({ ...graph }) }),
    reasonCodes: classification.reasonCodes,
  };
  return Object.freeze({ ...body, decisionId: createHash("sha256").update(stable(body)).digest("hex") });
}
