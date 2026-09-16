import { collectChangeSet, digestChangeSet } from "../change-set.mjs";
import { collectSignals, loadSignalPolicy } from "./collect-signals.mjs";
import { analyzeImportGraph } from "./import-graph.mjs";
import { loadRoutingPolicy } from "./policy.mjs";
import { classifyRoute } from "./classify-route.mjs";
import { createRouteDecision } from "./route-decision.mjs";
import { normalizeRouteInput } from "./route-input.mjs";

/** Routes a declared baseline to its checked-out working-tree snapshot. */
export async function routeRepository(input) {
  const routeInput = normalizeRouteInput(input);
  const { repository, intent, targets, taskFacts, riskFacts, graphPolicy } = routeInput;
  const [changeSet, signalPolicy, routingPolicy] = await Promise.all([
    collectChangeSet({ root: repository.root, base: repository.base, head: repository.head, workingTree: true }),
    loadSignalPolicy(),
    loadRoutingPolicy(),
  ]);
  const [signals, graph, changeSetDigest] = await Promise.all([
    collectSignals({ root: repository.root, changeSet, policy: signalPolicy }),
    analyzeImportGraph({ root: repository.root, changeSet, policy: { ...graphPolicy, policyVersion: routingPolicy.policyVersion } }),
    digestChangeSet({ root: repository.root, changeSet }),
  ]);
  const classification = classifyRoute({ signals, graph, taskFacts, riskFacts, policy: routingPolicy });
  return createRouteDecision({
    intent,
    measurementPurpose: changeSet.length === 0 ? "bootstrap" : "material",
    targets,
    repositoryRoot: repository.root,
    changeSetDigest,
    classification,
    signals,
    graph,
    policyVersion: routingPolicy.policyVersion,
    routeInputDigest: routeInput.routeInputDigest,
  });
}
