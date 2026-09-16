import { deriveRiskFloorFromFacts } from "./classify-risk.mjs";

const criticalFlags = new Set(["touchesAuth", "touchesAuthorization", "touchesCryptoOrSecrets", "touchesTenantIsolation", "touchesMoneyMovement", "destructiveMigration", "touchesExposedParser"]);
const highFlags = new Set(["touchesPersistence", "touchesPublicAPI", "touchesConcurrency", "touchesMigration", "touchesRuntimeConfig"]);
const signalFlags = ["touchesAuth", "touchesAuthorization", "touchesCryptoOrSecrets", "touchesTenantIsolation", "touchesMoneyMovement", "touchesMigration", "destructiveMigration", "touchesRuntimeConfig", "touchesPublicAPI", "touchesPersistence", "touchesConcurrency", "touchesGeneratedCode", "touchesExposedParser"];

function fail(message) { throw new Error(`route classifier: ${message}`); }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** Classifies measured routing inputs; unknown or partial evidence can never retain Low or Medium. */
export function classifyRoute({ signals, graph, taskFacts, riskFacts, policy }) {
  if (!object(signals) || !object(graph) || !object(taskFacts) || !object(riskFacts) || !object(policy?.thresholds)) fail("input has an invalid shape");
  if (typeof taskFacts.behaviorAffecting !== "boolean") fail("taskFacts.behaviorAffecting must be boolean");
  const reasons = [];
  const trueFlags = signalFlags.filter((flag) => signals[flag] === true);
  const unknownFlags = signalFlags.filter((flag) => signals[flag] === "unknown");
  const critical = trueFlags.filter((flag) => criticalFlags.has(flag));
  const high = trueFlags.filter((flag) => highFlags.has(flag));
  if (critical.length) reasons.push(...critical.map((flag) => `critical:${flag}`));
  if (unknownFlags.length) reasons.push("uncertainty:unknown-signals");
  if (graph.materialUnknown) reasons.push("uncertainty:partial-graph");
  if (signals.unclassifiedChangedFiles > 0) reasons.push("uncertainty:unclassified-changes");
  if (high.length) reasons.push(...high.map((flag) => `high:${flag}`));
  reasons.push(...deriveRiskFloorFromFacts(riskFacts).reasons.map((reason) => `floor:${reason}`));
  if (signals.changedCodeFiles > policy.thresholds.maxMediumCodeFiles) reasons.push("threshold:code-files");
  if (signals.changedLines > policy.thresholds.maxMediumChangedLines) reasons.push("threshold:changed-lines");
  if (graph.affectedModuleCount > policy.thresholds.maxMediumAffectedModules) reasons.push("threshold:affected-modules");
  if (graph.reverseDependentCount > policy.thresholds.maxMediumReverseDependents) reasons.push("threshold:reverse-dependents");
  const risk = critical.length ? "critical" : reasons.length ? "high" : taskFacts.behaviorAffecting ? "medium" : "low";
  return Object.freeze({ risk, reasonCodes: Object.freeze(reasons), securityReviewRequired: critical.length > 0, verificationRequired: risk !== "low" });
}
