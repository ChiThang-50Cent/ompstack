import { collectChangeSet, digestChangeSet } from "../change-set.mjs";
import { collectSignals, loadSignalPolicy } from "./collect-signals.mjs";
import { analyzeImportGraph } from "./import-graph.mjs";
import { loadRoutingPolicy } from "./policy.mjs";
import { classifyRoute } from "./classify-route.mjs";
import { createRouteDecision } from "./route-decision.mjs";
import { normalizeRouteInput, physicalTargetPath } from "./route-input.mjs";

const RISK_RANK = Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 });
const CODE_EXTENSIONS = new Set([".c", ".cc", ".cpp", ".go", ".java", ".js", ".jsx", ".mjs", ".py", ".rb", ".rs", ".ts", ".tsx"]);

/** Reserves a stable floor from the declared physical scope, independent of the measured snapshot. */
export function deriveTargetRiskReservation(targets) {
  const reasons = [];
  let reserved = "low";
  for (const target of targets) {
    const physical = physicalTargetPath(target);
    const basename = physical.split("/").at(-1) ?? "";
    const extension = basename.includes(".") ? basename.slice(basename.lastIndexOf(".")).toLowerCase() : "";
    const candidate = extension === "" ? "high" : CODE_EXTENSIONS.has(extension) ? "medium" : "low";
    if (RISK_RANK[candidate] > RISK_RANK[reserved]) reserved = candidate;
    if (candidate === "high") reasons.push(`declared-broad-target:${physical}`);
    else if (candidate === "medium") reasons.push(`declared-code-target:${physical}`);
  }
  const physicalTargets = new Set(targets.map(physicalTargetPath));
  if (physicalTargets.size > 1 && RISK_RANK[reserved] < RISK_RANK.high) {
    reserved = "high";
    reasons.push("multiple-declared-targets");
  }
  return Object.freeze({ reserved, reservationReasons: Object.freeze([...new Set(reasons)].sort()) });
}

/** Routes a declared baseline to its checked-out working-tree snapshot. */
export async function routeRepository(input) {
  const routeInput = normalizeRouteInput(input);
  const { repository, intent, targets, taskFacts, riskFacts, graphPolicy } = routeInput;
  const [changeSet, signalPolicy, routingPolicy] = await Promise.all([
    collectChangeSet({ root: repository.root, base: repository.base, head: repository.head, workingTree: true }),
    loadSignalPolicy({ root: repository.root }),
    loadRoutingPolicy(),
  ]);
  const [signals, graph, changeSetDigest] = await Promise.all([
    collectSignals({ root: repository.root, changeSet, policy: signalPolicy }),
    analyzeImportGraph({ root: repository.root, changeSet, policy: { ...graphPolicy, policyVersion: routingPolicy.policyVersion } }),
    digestChangeSet({ root: repository.root, changeSet }),
  ]);
  const classification = classifyRoute({ signals, graph, taskFacts, riskFacts, policy: routingPolicy });
  const reservation = deriveTargetRiskReservation(targets);
  return createRouteDecision({
    intent,
    measurementPurpose: changeSet.length === 0 ? "bootstrap" : "material",
    targets,
    scratchPaths: repository.scratchPaths ?? [],
    repositoryRoot: repository.root,
    changeSetDigest,
    classification,
    measuredRisk: classification.risk,
    reservedRisk: reservation.reserved,
    reservationReasons: reservation.reservationReasons,
    signals,
    graph,
    policyVersion: routingPolicy.policyVersion,
    routeInputDigest: routeInput.routeInputDigest,
    declaredRiskFacts: riskFacts,
  });
}
