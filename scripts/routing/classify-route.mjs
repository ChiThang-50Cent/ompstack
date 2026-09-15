import { deriveRiskFloorFromFacts } from "./classify-risk.mjs";

const criticalFlags = new Set(["touchesAuth", "touchesAuthorization", "touchesCryptoOrSecrets", "touchesTenantIsolation", "touchesMoneyMovement", "destructiveMigration"]);
const highFlags = new Set(["touchesPersistence", "touchesPublicAPI", "touchesConcurrency", "touchesMigration", "touchesRuntimeConfig"]);
const signalFlags = ["touchesAuth", "touchesAuthorization", "touchesCryptoOrSecrets", "touchesTenantIsolation", "touchesMoneyMovement", "touchesMigration", "destructiveMigration", "touchesRuntimeConfig", "touchesPublicAPI", "touchesPersistence", "touchesConcurrency", "touchesGeneratedCode"];

function fail(message) { throw new Error(`route classifier: ${message}`); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** Classifies measured routing inputs; unknown or partial evidence can never retain Low or Medium. */
export function classifyRoute({ signals, graph, taskFacts, riskFacts, policy }) {
  if (!object(signals) || !object(graph) || !object(taskFacts) || !object(riskFacts) || !object(policy?.thresholds)) fail("input has an invalid shape");
  if (typeof taskFacts.behaviorAffecting !== "boolean") fail("taskFacts.behaviorAffecting must be boolean");
  const reasons = [];
  const trueFlags = signalFlags.filter((flag) => signals[flag] === true);
  const unknownFlags = signalFlags.filter((flag) => signals[flag] === "unknown");
  if (trueFlags.some((flag) => criticalFlags.has(flag))) reasons.push("critical-sensitive-surface");
  else if (unknownFlags.length || graph.materialUnknown || signals.unclassifiedChangedFiles > 0) reasons.push("material-uncertainty");
  else if (trueFlags.some((flag) => highFlags.has(flag))) reasons.push("high-sensitive-surface");
  else if (deriveRiskFloorFromFacts(riskFacts).minimumRisk === "high") reasons.push("risk-floor");
  else if (signals.changedCodeFiles > policy.thresholds.maxMediumCodeFiles || signals.changedLines > policy.thresholds.maxMediumChangedLines || graph.affectedModuleCount > policy.thresholds.maxMediumAffectedModules || graph.reverseDependentCount > policy.thresholds.maxMediumReverseDependents) reasons.push("blast-radius-threshold");
  const risk = reasons[0] === "critical-sensitive-surface" ? "critical" : reasons.length ? "high" : taskFacts.behaviorAffecting ? "medium" : "low";
  return Object.freeze({ risk, reasonCodes: Object.freeze(reasons), securityReviewRequired: risk === "critical", verificationRequired: risk !== "low" });
}
