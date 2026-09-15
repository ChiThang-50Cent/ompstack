export function deriveRiskFloorFromFacts(facts) {
  const reasons = [];

  if (facts.sharedSemanticBoundary) reasons.push("shared-semantic-boundary");
  if (facts.executionModes > 1) reasons.push("multiple-execution-modes");
  if (facts.graphTraversal) reasons.push("graph-traversal");
  if (facts.materialUnknown) reasons.push("material-uncertainty");

  return {
    minimumRisk: reasons.length > 0 ? "high" : null,
    reasons,
  };
}
