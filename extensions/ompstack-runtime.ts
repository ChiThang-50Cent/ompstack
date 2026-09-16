import { routeRepository } from "../scripts/routing/route-repository.mjs";
import type { ExtensionAPI, ToolCallEvent } from "@oh-my-pi/pi-coding-agent";

type RouteInput = Parameters<typeof routeRepository>[0];
type EvidenceLane = "reviewer" | "verifier" | "security-reviewer";
type ActiveDecision = { decisionId: string; requiredIndependentEvidence?: unknown };
type SessionContext = { sessionManager: { getBranch(): Iterable<unknown> } };

const DECISION_TYPE = "io.github.chithang-50cent.ompstack.route-decision.v1";
const DECISION_STATE_TYPE = "io.github.chithang-50cent.ompstack.route-decision-state.v1";
const ACTIVATION_STATE_TYPE = "io.github.chithang-50cent.ompstack.route-activation.v1";
const EVIDENCE_STATE_TYPE = "io.github.chithang-50cent.ompstack.route-evidence.v1";
const READ_ONLY_TOOLS: Record<string, true> = { read: true, grep: true, glob: true, web_search: true, ompstack_route: true, ompstack_phase: true };
const EVIDENCE_LANES = new Set<EvidenceLane>(["reviewer", "verifier", "security-reviewer"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isDecision(value: unknown): value is ActiveDecision {
  const candidate = record(value);
  return candidate !== null && typeof candidate.decisionId === "string" && /^[a-f0-9]{64}$/.test(candidate.decisionId);
}

function isDecisionState(value: unknown): value is { decisionId: string; state: "invalidated"; reason: string } {
  const candidate = record(value);
  return isDecision(value) && candidate?.state === "invalidated" && typeof candidate.reason === "string" && candidate.reason !== "";
}

function isActivationState(value: unknown): value is { workflow: "ompstack" } {
  return record(value)?.workflow === "ompstack";
}

function isEvidenceState(value: unknown): value is { decisionId: string; evidence: EvidenceLane } {
  const candidate = record(value);
  return isDecision(value) && typeof candidate?.evidence === "string" && EVIDENCE_LANES.has(candidate.evidence as EvidenceLane);
}

function requiredEvidence(decision: ActiveDecision | null): EvidenceLane[] {
  if (!Array.isArray(decision?.requiredIndependentEvidence)) return [];
  return decision.requiredIndependentEvidence.filter((item): item is EvidenceLane => typeof item === "string" && EVIDENCE_LANES.has(item as EvidenceLane));
}

function taskBindsDecision(input: unknown, decisionId: string) {
  const candidate = record(input);
  const header = `Route-Decision: sha256:${decisionId}`;
  return typeof candidate?.context === "string" && candidate.context.split("\n").includes(header) ||
    typeof candidate?.task === "string" && candidate.task.split("\n").includes(header);
}

function requestedEvidence(input: unknown): EvidenceLane[] {
  const candidate = record(input);
  if (!Array.isArray(candidate?.tasks)) return [];
  return [...new Set(candidate.tasks.flatMap((task) => {
    const agent = record(task)?.agent;
    return typeof agent === "string" && EVIDENCE_LANES.has(agent as EvidenceLane) ? [agent as EvidenceLane] : [];
  }))];
}

function isReadOnlyTool(event: ToolCallEvent) {
  return event.toolName in READ_ONLY_TOOLS || (event.toolName === "todo" && record(event.input)?.op === "view");
}


/** Persists one measured RouteDecision for the explicit Ompstack session until a fresh route supersedes it. */
export default function ompstackRuntime(pi: ExtensionAPI) {
  const z = pi.zod;
  let enforcementActive = false;
  let activeDecision: ActiveDecision | null = null;
  let observedEvidence = new Set<EvidenceLane>();
  const pendingTaskEvidence = new Map<string, { decisionId: string; evidence: EvidenceLane[] }>();

  function invalidateActiveDecision(reason: string) {
    if (!activeDecision) return;
    pi.appendEntry(DECISION_STATE_TYPE, { decisionId: activeDecision.decisionId, state: "invalidated", reason });
    activeDecision = null;
    observedEvidence = new Set();
  }

  function observeEvidence(decisionId: string, evidence: EvidenceLane) {
    if (activeDecision?.decisionId !== decisionId || !requiredEvidence(activeDecision).includes(evidence) || observedEvidence.has(evidence)) return;
    pi.appendEntry(EVIDENCE_STATE_TYPE, { decisionId, evidence });
    observedEvidence.add(evidence);
  }

  function rebuild(ctx: SessionContext) {
    enforcementActive = false;
    activeDecision = null;
    observedEvidence = new Set();
    pendingTaskEvidence.clear();
    for (const entry of ctx.sessionManager.getBranch()) {
      const item = record(entry);
      if (item?.type !== "custom") continue;
      if (item.customType === ACTIVATION_STATE_TYPE && isActivationState(item.data)) enforcementActive = true;
      if (item.customType === DECISION_TYPE && isDecision(item.data)) {
        enforcementActive = true;
        activeDecision = item.data;
        observedEvidence = new Set();
      }
      if (item.customType === EVIDENCE_STATE_TYPE && isEvidenceState(item.data) && activeDecision?.decisionId === item.data.decisionId) {
        observedEvidence.add(item.data.evidence);
      }
      if (item.customType === DECISION_STATE_TYPE && isDecisionState(item.data) && activeDecision?.decisionId === item.data.decisionId) {
        enforcementActive = true;
        activeDecision = null;
        observedEvidence = new Set();
      }
    }
  }

  pi.on("session_start", (_event, ctx) => rebuild(ctx));
  pi.on("session_switch", (_event, ctx) => rebuild(ctx));
  pi.on("session_branch", (_event, ctx) => rebuild(ctx));
  pi.on("session_tree", (_event, ctx) => rebuild(ctx));
  pi.on("input", (event) => {
    if (!/(?:^|\s)\/(?:skill:)?ompstack(?:\s|$)/.test(event.text) || enforcementActive) return;
    pi.appendEntry(ACTIVATION_STATE_TYPE, { workflow: "ompstack" });
    enforcementActive = true;
  });

  pi.registerTool({
    name: "ompstack_route",

    label: "Route repository change",
    description: "Measure a declared repository revision pair and persist its immutable RouteDecision.",
    parameters: z.object({
      intent: z.enum(["investigation", "bug-fix", "feature", "refactoring", "prototype", "perf-issue", "runtime-forensics", "trace-forensics", "eval"]),
      targets: z.array(z.string()).min(1),
      taskFacts: z.object({ behaviorAffecting: z.boolean(), plannedWriteLanes: z.array(z.string()), proofSurface: z.string().min(1) }).strict(),
      repository: z.object({ root: z.string().min(1), base: z.string().min(1), head: z.string().min(1) }).strict(),
      riskFacts: z.object({ sharedSemanticBoundary: z.boolean(), consumerFamilies: z.number().int().nonnegative(), executionModes: z.number().int().nonnegative(), graphTraversal: z.boolean(), materialUnknown: z.boolean() }).strict(),
      graphPolicy: z.object({ sourceRoots: z.object({ go: z.array(z.string()), python: z.array(z.string()), typescript: z.array(z.string()), java: z.array(z.string()) }).strict() }).strict(),
    }).strict(),
    async execute(_id, input) {
      const decision = await routeRepository(input as RouteInput);
      invalidateActiveDecision("superseded-by-fresh-route");
      pi.appendEntry(DECISION_TYPE, decision);
      enforcementActive = true;
      activeDecision = decision;
      observedEvidence = new Set();
      return { content: [{ type: "text", text: `Route-Decision: sha256:${decision.decisionId}` }], details: decision };
    },
  });

  pi.registerTool({
    name: "ompstack_phase",
    label: "Inspect Ompstack phase evidence",
    description: "Report independent evidence observed from successfully launched task lanes.",
    parameters: z.object({}).strict(),
    async execute() {
      if (!enforcementActive || !activeDecision) throw new Error("ompstack phase requires a valid RouteDecision");
      const required = requiredEvidence(activeDecision);
      const observed = [...observedEvidence].sort();
      return {
        content: [{ type: "text", text: `Route-Decision: sha256:${activeDecision.decisionId}\nObserved evidence: ${observed.join(", ") || "none"}` }],
        details: {
          decisionId: activeDecision.decisionId,
          requiredIndependentEvidence: required,
          observedIndependentEvidence: observed,
          missingIndependentEvidence: required.filter((evidence) => !observedEvidence.has(evidence)),
          runtimeEvidenceCoverage: "partial",
        },
      };
    },
  });

  pi.on("tool_call", async (event) => {
    if (isReadOnlyTool(event) || !enforcementActive) return;
    if (!activeDecision) return { block: true, reason: "ompstack requires a valid RouteDecision before mutable or unknown execution" };
    if (event.toolName !== "task") return;
    if (!taskBindsDecision(event.input, activeDecision.decisionId)) return { block: true, reason: "task requires an exact Route-Decision header" };
    const evidence = requestedEvidence(event.input).filter((lane) => requiredEvidence(activeDecision).includes(lane));
    if (evidence.length) pendingTaskEvidence.set(event.toolCallId, { decisionId: activeDecision.decisionId, evidence });
  });

  pi.on("tool_execution_end", (event) => {
    if (event.toolName !== "task") return;
    const pending = pendingTaskEvidence.get(event.toolCallId);
    pendingTaskEvidence.delete(event.toolCallId);
    if (!pending || event.isError) return;
    for (const evidence of pending.evidence) observeEvidence(pending.decisionId, evidence);
  });
}
