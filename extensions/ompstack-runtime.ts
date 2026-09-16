import { dirname, resolve, sep } from "node:path";
import { realpath } from "node:fs/promises";
import { routeRepository } from "../scripts/routing/route-repository.mjs";
import type { ExtensionAPI, ToolCallEvent } from "@oh-my-pi/pi-coding-agent";

type RouteInput = Parameters<typeof routeRepository>[0];
type EvidenceLane = "reviewer" | "verifier" | "security-reviewer";
type ActiveDecision = { decisionId: string; requiredIndependentEvidence?: unknown; measurementPurpose: "bootstrap" | "material"; repositoryRoot: string; targets: readonly string[] };
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
  return candidate !== null &&
    typeof candidate.decisionId === "string" &&
    /^[a-f0-9]{64}$/.test(candidate.decisionId) &&
    (candidate.measurementPurpose === "bootstrap" || candidate.measurementPurpose === "material") &&
    typeof candidate.repositoryRoot === "string" &&
    candidate.repositoryRoot !== "" &&
    Array.isArray(candidate.targets) &&
    candidate.targets.length > 0 &&
    candidate.targets.every((target) => typeof target === "string" && target !== "");
}

function isDecisionState(value: unknown): value is { decisionId: string; state: "invalidated" | "material-stale"; reason: string } {
  const candidate = record(value);
  return candidate !== null && typeof candidate.decisionId === "string" && /^[a-f0-9]{64}$/.test(candidate.decisionId) && (candidate.state === "invalidated" || candidate.state === "material-stale") && typeof candidate.reason === "string" && candidate.reason !== "";
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
function isProtocolPath(path: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(path);
}

function isDescendant(root: string, path: string) {
  return path === root || path.startsWith(`${root}${sep}`);
}

async function nearestExistingRealPath(path: string) {
  let candidate = path;
  while (true) {
    try {
      return await realpath(candidate);
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")) throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

function mutationPaths(event: ToolCallEvent) {
  if (event.toolName === "write") {
    const path = record(event.input)?.path;
    return typeof path === "string" && path !== "" ? [path] : null;
  }
  if (event.toolName !== "edit") return [];
  const input = record(event.input);
  if (Array.isArray(input?.paths)) return input.paths.every((path) => typeof path === "string" && path !== "") ? input.paths : null;
  return typeof input?.path === "string" && input.path !== "" ? [input.path] : null;
}

async function outsideDeclaredScope(decision: ActiveDecision, event: ToolCallEvent) {
  const paths = mutationPaths(event);
  if (paths === null) return "ompstack cannot determine the write or edit target";
  const repositoryRoot = resolve(decision.repositoryRoot);
  const realRepositoryRoot = await realpath(repositoryRoot);
  for (const path of paths) {
    if (isProtocolPath(path)) continue;
    const candidate = resolve(repositoryRoot, path);
    if (!isDescendant(repositoryRoot, candidate)) return `ompstack target is outside the declared repository: ${path}`;
    const realCandidate = await nearestExistingRealPath(candidate);
    if (!isDescendant(realRepositoryRoot, realCandidate)) return `ompstack target escapes the declared repository through a symlink: ${path}`;
    if (!decision.targets.some((target) => {
      const targetPath = resolve(repositoryRoot, target);
      return candidate === targetPath || candidate.startsWith(`${targetPath}${sep}`);
    })) return `ompstack target is outside the RouteDecision scope: ${path}`;
  }
  return undefined;
}


/** Persists one measured RouteDecision for the explicit Ompstack session until a fresh route supersedes it. */
export default function ompstackRuntime(pi: ExtensionAPI) {
  const z = pi.zod;
  let enforcementActive = false;
  let activeDecision: ActiveDecision | null = null;
  let materialRouteCurrent = false;
  let observedEvidence = new Set<EvidenceLane>();
  const pendingTaskEvidence = new Map<string, { decisionId: string; evidence: EvidenceLane[] }>();
  async function invalidateActiveDecision(reason: string) {
    if (!activeDecision) return;
    await pi.appendEntry(DECISION_STATE_TYPE, { decisionId: activeDecision.decisionId, state: "invalidated", reason });
    activeDecision = null;
    materialRouteCurrent = false;
    observedEvidence = new Set();
  }

  async function markMaterialRouteStale() {
    if (!activeDecision || !materialRouteCurrent) return;
    await pi.appendEntry(DECISION_STATE_TYPE, { decisionId: activeDecision.decisionId, state: "material-stale", reason: "workspace-mutation-after-route" });
    materialRouteCurrent = false;
  }

  async function observeEvidence(decisionId: string, evidence: EvidenceLane) {
    if (activeDecision?.decisionId !== decisionId || !requiredEvidence(activeDecision).includes(evidence) || observedEvidence.has(evidence)) return;
    await pi.appendEntry(EVIDENCE_STATE_TYPE, { decisionId, evidence });
    observedEvidence.add(evidence);
  }

  function rebuild(ctx: SessionContext) {
    enforcementActive = false;
    activeDecision = null;
    materialRouteCurrent = false;
    observedEvidence = new Set();
    pendingTaskEvidence.clear();
    for (const entry of ctx.sessionManager.getBranch()) {
      const item = record(entry);
      if (item?.type !== "custom") continue;
      if (item.customType === ACTIVATION_STATE_TYPE && isActivationState(item.data)) enforcementActive = true;
      if (item.customType === DECISION_TYPE && isDecision(item.data)) {
        enforcementActive = true;
        activeDecision = item.data;
        materialRouteCurrent = item.data.measurementPurpose === "material";
        observedEvidence = new Set();
      }
      if (item.customType === EVIDENCE_STATE_TYPE && isEvidenceState(item.data) && activeDecision?.decisionId === item.data.decisionId) {
        observedEvidence.add(item.data.evidence);
      }
      if (item.customType === DECISION_STATE_TYPE && isDecisionState(item.data) && activeDecision?.decisionId === item.data.decisionId) {
        enforcementActive = true;
        if (item.data.state === "invalidated") {
          activeDecision = null;
          materialRouteCurrent = false;
          observedEvidence = new Set();
        } else {
          materialRouteCurrent = false;
        }
      }
    }
  }

  pi.on("session_start", (_event, ctx) => rebuild(ctx));
  pi.on("session_switch", (_event, ctx) => rebuild(ctx));
  pi.on("session_branch", (_event, ctx) => rebuild(ctx));
  pi.on("session_tree", (_event, ctx) => rebuild(ctx));
  pi.on("input", async (event) => {
    if (!/(?:^|\s)\/(?:skill:)?ompstack(?:\s|$)/.test(event.text) || enforcementActive) return;
    await pi.appendEntry(ACTIVATION_STATE_TYPE, { workflow: "ompstack" });
    enforcementActive = true;
  });

  pi.registerTool({
    name: "ompstack_route",

    label: "Route repository change",
    description: "Measure the checked-out working tree against a declared baseline and persist its RouteDecision.",
    parameters: z.object({
      intent: z.enum(["investigation", "bug-fix", "feature", "refactoring", "prototype", "perf-issue", "runtime-forensics", "trace-forensics", "eval"]),
      measurementPurpose: z.enum(["bootstrap", "material"]),
      targets: z.array(z.string()).min(1),
      taskFacts: z.object({ behaviorAffecting: z.boolean(), plannedWriteLanes: z.array(z.string()), proofSurface: z.string().min(1) }).strict(),
      repository: z.object({ root: z.string().min(1), base: z.string().min(1), head: z.string().min(1) }).strict(),
      riskFacts: z.object({ sharedSemanticBoundary: z.boolean(), consumerFamilies: z.number().int().nonnegative(), executionModes: z.number().int().nonnegative(), graphTraversal: z.boolean(), materialUnknown: z.boolean() }).strict(),
      graphPolicy: z.object({ sourceRoots: z.object({ go: z.array(z.string()), python: z.array(z.string()), typescript: z.array(z.string()), java: z.array(z.string()) }).strict() }).strict(),
    }).strict(),
    async execute(_id, input) {
      const decision = await routeRepository(input as RouteInput);
      await invalidateActiveDecision("superseded-by-fresh-route");
      await pi.appendEntry(DECISION_TYPE, decision);
      enforcementActive = true;
      activeDecision = decision;
      materialRouteCurrent = decision.measurementPurpose === "material";
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
          materialRouteCurrent,
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
    const scopeReason = event.toolName === "write" || event.toolName === "edit" ? await outsideDeclaredScope(activeDecision, event) : undefined;
    if (scopeReason) return { block: true, reason: scopeReason };
    if (event.toolName !== "task") return;
    if (!taskBindsDecision(event.input, activeDecision.decisionId)) return { block: true, reason: "task requires an exact Route-Decision header" };
    const evidence = requestedEvidence(event.input).filter((lane) => requiredEvidence(activeDecision).includes(lane));
    if (evidence.length && !materialRouteCurrent) return { block: true, reason: "task requires a fresh material RouteDecision before independent evidence" };
    if (evidence.length) pendingTaskEvidence.set(event.toolCallId, { decisionId: activeDecision.decisionId, evidence });
  });

  pi.on("tool_execution_end", async (event) => {
    if ((event.toolName === "write" || event.toolName === "edit") && !event.isError) await markMaterialRouteStale();
    if (event.toolName !== "task") return;
    const pending = pendingTaskEvidence.get(event.toolCallId);
    pendingTaskEvidence.delete(event.toolCallId);
    if (!pending || event.isError) return;
    for (const evidence of pending.evidence) await observeEvidence(pending.decisionId, evidence);
  });
}
