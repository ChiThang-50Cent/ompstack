import { collectChangeSet } from "../change-set.mjs";
import { collectSignals, loadSignalPolicy } from "./collect-signals.mjs";
import { analyzeImportGraph } from "./import-graph.mjs";
import { loadRoutingPolicy } from "./policy.mjs";
import { classifyRoute } from "./classify-route.mjs";
import { createRouteDecision } from "./route-decision.mjs";

/** Routes one declared revision pair; graph roots remain an explicit target-repository input. */
export async function routeRepository({ root = process.cwd(), base, head, intent, taskFacts, riskFacts, graphPolicy }) {
  const [changeSet, signalPolicy, routingPolicy] = await Promise.all([
    collectChangeSet({ root, base, head }),
    loadSignalPolicy(),
    loadRoutingPolicy(),
  ]);
  const [signals, graph] = await Promise.all([
    collectSignals({ root, changeSet, policy: signalPolicy }),
    analyzeImportGraph({ root, changeSet, policy: { ...graphPolicy, policyVersion: routingPolicy.policyVersion } }),
  ]);
  const classification = classifyRoute({ signals, graph, taskFacts, riskFacts, policy: routingPolicy });
  return createRouteDecision({ intent, classification, signals, graph, policyVersion: routingPolicy.policyVersion });
}
