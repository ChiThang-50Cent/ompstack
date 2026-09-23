import { dirname, join, resolve, sep } from "node:path";
import { readdir, realpath } from "node:fs/promises";
import { routeRepository } from "../scripts/routing/route-repository.mjs";
import type { ExtensionAPI, ToolCallEvent } from "@oh-my-pi/pi-coding-agent";

type RouteInput = Parameters<typeof routeRepository>[0];
type EvidenceLane = "reviewer" | "verifier" | "security-reviewer";
type ActivationSource = "input" | "skill-read" | "route-call" | "marker";
type ActiveDecision = { decisionId: string; requiredIndependentEvidence?: unknown; measurementPurpose: "bootstrap" | "material"; repositoryRoot: string; targets: readonly string[]; scratchPaths?: readonly string[]; risk?: string; measuredRisk?: string; riskBudget?: { measured?: string; reserved?: string; effective?: string; reservationReasons?: readonly string[] } };
type ActivationState = { workflow: "ompstack"; source?: string };
type RouteSkipState = { reason: "enforcement-inactive"; firstToolName: string };
type SessionContext = { sessionManager: { getBranch(): Iterable<unknown> } };
type ScopeViolation = { reason: string; path: string | null };

const DECISION_TYPE = "io.github.chithang-50cent.ompstack.route-decision.v1";
const DECISION_STATE_TYPE = "io.github.chithang-50cent.ompstack.route-decision-state.v1";
const ACTIVATION_STATE_TYPE = "io.github.chithang-50cent.ompstack.route-activation.v1";
const EVIDENCE_STATE_TYPE = "io.github.chithang-50cent.ompstack.route-evidence.v1";
const BLOCK_STATE_TYPE = "io.github.chithang-50cent.ompstack.route-block.v1";
const SKIP_STATE_TYPE = "io.github.chithang-50cent.ompstack.route-skip.v1";
const TOOL_EVENT_TYPE = "io.github.chithang-50cent.ompstack.route-tool.v1";
const EVIDENCE_ATTEMPT_TYPE = "io.github.chithang-50cent.ompstack.route-evidence-attempt.v1";
const CLOSEOUT_TYPE = "io.github.chithang-50cent.ompstack.route-closeout.v1";
const READ_ONLY_TOOLS: Record<string, true> = { read: true, grep: true, glob: true, web_search: true, ompstack_route: true, ompstack_phase: true };
const ROUTE_PROTOCOL_PATH = "xd://ompstack_route";
const PHASE_PROTOCOL_PATH = "xd://ompstack_phase";
const TELEMETRY_REFERENCE = /^(?:agent|artifact|history):\/\/\S+$/;
const ACTIVATION_MARKER = "<!-- ompstack:activate -->";
const ACTIVATION_SOURCES: Record<ActivationSource, true> = { input: true, "skill-read": true, "route-call": true, marker: true };
const EVIDENCE_LANES = ["reviewer", "verifier", "security-reviewer"] as const;
const EVIDENCE_LANE_SET = new Set<EvidenceLane>(EVIDENCE_LANES);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function targetPhysicalPath(target: string) {
  const separator = target.indexOf(":");
  return separator < 0 ? target : target.slice(0, separator);
}
function validDeclaredTarget(target: unknown) {
  if (typeof target !== "string" || target === "") return false;
  const separator = target.indexOf(":");
  const physical = separator < 0 ? target : target.slice(0, separator);
  const symbol = separator < 0 ? null : target.slice(separator + 1);
  return physical !== "." && !physical.startsWith("/") && !physical.startsWith("./") && !physical.endsWith("/") && !physical.includes("//") && !physical.split("/").includes("..") && (symbol === null || (symbol !== "" && symbol.trim() === symbol && !symbol.includes(":") && !symbol.includes("/") && !symbol.includes("\\")));
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
    candidate.targets.every(validDeclaredTarget) &&
    (candidate.scratchPaths === undefined || (Array.isArray(candidate.scratchPaths) && candidate.scratchPaths.every((path) => typeof path === "string" && validLocalMutationPath(path))));
}
function isDecisionState(value: unknown): value is { decisionId: string; state: "invalidated" | "material-stale"; reason: string } {
  const candidate = record(value);
  return candidate !== null && typeof candidate.decisionId === "string" && /^[a-f0-9]{64}$/.test(candidate.decisionId) && (candidate.state === "invalidated" || candidate.state === "material-stale") && typeof candidate.reason === "string" && candidate.reason !== "";
}
function isActivationState(value: unknown): value is ActivationState {
  const candidate = record(value);
  return candidate?.workflow === "ompstack" && (candidate.source === undefined || (typeof candidate.source === "string" && candidate.source !== "" && (Object.hasOwn(ACTIVATION_SOURCES, candidate.source) || candidate.source.length > 0)));
}
function validLocalMutationPath(path: string) {
  const relative = path.slice("local://".length);
  return relative !== "" && !relative.startsWith("/") && !relative.endsWith("/") && !relative.includes("//") && !relative.split("/").includes("..") && !relative.split("/").includes(".");
}
function isRouteSkipState(value: unknown): value is RouteSkipState {
  const candidate = record(value);
  return candidate?.reason === "enforcement-inactive" && typeof candidate.firstToolName === "string" && candidate.firstToolName !== "";
}
function isEvidenceState(value: unknown): value is { decisionId: string; evidence: string } {
  const candidate = record(value);
  return candidate !== null &&
    typeof candidate.decisionId === "string" &&
    /^[a-f0-9]{64}$/.test(candidate.decisionId) &&
    typeof candidate.evidence === "string" &&
    canonicalEvidence(candidate.evidence) !== undefined;
}
function canonicalEvidence(value: unknown): EvidenceLane | undefined {
  if (value === "ompstack-verifier") return "verifier";
  return typeof value === "string" && EVIDENCE_LANE_SET.has(value as EvidenceLane) ? value as EvidenceLane : undefined;
}
function normalizeEvidence(values: unknown): EvidenceLane[] {
  const requested: Partial<Record<EvidenceLane, true>> = {};
  if (Array.isArray(values)) {
    for (const value of values) {
      const evidence = canonicalEvidence(value);
      if (evidence !== undefined) requested[evidence] = true;
    }
  }
  return EVIDENCE_LANES.filter((lane) => requested[lane] === true);
}
function requiredEvidence(decision: ActiveDecision | null): EvidenceLane[] {
  return normalizeEvidence(decision?.requiredIndependentEvidence);
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
  return normalizeEvidence(candidate.tasks.flatMap((task) => {
    const agent = record(task)?.agent;
    return typeof agent === "string" ? [agent] : [];
  }));
}


function isReadOnlyTool(event: ToolCallEvent) {
  const path = record(event.input)?.path;
  return event.toolName in READ_ONLY_TOOLS ||
    (event.toolName === "todo" && record(event.input)?.op === "view") ||
    (event.toolName === "write" && (path === ROUTE_PROTOCOL_PATH || path === PHASE_PROTOCOL_PATH));
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
function collectReferences(value: unknown, references: string[] = [], seen = new Set<object>(), depth = 0): string[] {
  if (references.length >= 8 || depth > 5) return references;
  if (typeof value === "string") {
    if (TELEMETRY_REFERENCE.test(value) && !references.includes(value)) references.push(value);
    return references;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, references, seen, depth + 1);
    return references;
  }
  const candidate = record(value);
  if (candidate === null || seen.has(candidate)) return references;
  seen.add(candidate);
  for (const item of Object.values(candidate)) collectReferences(item, references, seen, depth + 1);
  return references;
}
function collectTaskReferences(value: unknown, references: string[] = []): string[] {
  if (references.length >= 8) return references;
  const candidate = record(value);
  const details = record(candidate?.details);
  const metadata = [
    ...(Array.isArray(details?.results) ? details.results : []),
    ...(Array.isArray(details?.progress) ? details.progress : []),
  ];
  for (const result of metadata) {
    if (references.length >= 8) break;
    const id = record(result)?.id;
    if (typeof id !== "string" || id === "") continue;
    const reference = `agent://${id}`;
    if (TELEMETRY_REFERENCE.test(reference) && !references.includes(reference)) references.push(reference);
  }
  return references;
}
function resultReferences(toolName: string, value: unknown): string[] {
  const references = collectReferences(value);
  return toolName === "task" ? collectTaskReferences(value, references) : references;
}



async function outsideDeclaredScope(decision: ActiveDecision, event: ToolCallEvent): Promise<ScopeViolation | undefined> {
  const paths = mutationPaths(event);
  if (paths === null) return { reason: "ompstack cannot determine the write or edit target", path: null };
  const repositoryRoot = resolve(decision.repositoryRoot);
  const realRepositoryRoot = await realpath(repositoryRoot);
  const targets = await Promise.all(decision.targets.map(async (target) => {
    const path = resolve(repositoryRoot, targetPhysicalPath(target));
    return { path, realPath: await nearestExistingRealPath(path) };
  }));
  const scratchPaths = decision.scratchPaths ?? [];
  for (const path of paths) {
    if (path === ROUTE_PROTOCOL_PATH || path === PHASE_PROTOCOL_PATH) continue;
    if (path.startsWith("local://")) {
      if (!validLocalMutationPath(path)) return { reason: `ompstack local scratch path is malformed: ${path}`, path };
      if (scratchPaths.some((scratch) => path === scratch || path.startsWith(`${scratch}/`))) continue;
      return { reason: `ompstack local scratch path is not declared: ${path}`, path };
    }
    if (isProtocolPath(path)) return { reason: `ompstack protocol write is not allowed: ${path}`, path };
    const candidate = resolve(repositoryRoot, path);
    if (!isDescendant(repositoryRoot, candidate)) return { reason: `ompstack target is outside the declared repository: ${path}`, path };
    const target = targets.find(({ path: targetPath }) => candidate === targetPath || candidate.startsWith(`${targetPath}${sep}`));
    if (target === undefined) return { reason: `ompstack target is outside the RouteDecision scope: ${path}`, path };
    const realCandidate = await nearestExistingRealPath(candidate);
    if (!isDescendant(realRepositoryRoot, realCandidate)) return { reason: `ompstack target escapes the declared repository through a symlink: ${path}`, path };
    if (!isDescendant(target.realPath, realCandidate)) return { reason: `ompstack target escapes the RouteDecision scope through a symlink: ${path}`, path };
  }
  return undefined;
}
async function verificationCapabilities(repositoryRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(join(repositoryRoot, ".omp", "skills"), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("verify-")).map((entry) => `.omp/skills/${entry.name}`).sort();
  } catch {
    return [];
  }
}
function mutationChangesRepository(decision: ActiveDecision, event: ToolCallEvent) {
  const paths = mutationPaths(event) ?? [];
  const scratchPaths = decision.scratchPaths ?? [];
  return paths.some((path) =>
    path !== ROUTE_PROTOCOL_PATH &&
    path !== PHASE_PROTOCOL_PATH &&
    !(path.startsWith("local://") && validLocalMutationPath(path) && scratchPaths.some((scratch) => path === scratch || path.startsWith(`${scratch}/`))),
  );
}


/** Persists one measured RouteDecision for the explicit Ompstack session until a fresh route supersedes it. */
export default function ompstackRuntime(pi: ExtensionAPI) {
  const z = pi.zod;
  let enforcementActive = false;
  let activeDecision: ActiveDecision | null = null;
  let materialRouteCurrent = false;
  let routeSkipRecorded = false;
  let observedEvidence = new Set<EvidenceLane>();
  let lastCloseoutPassed = false;
  let shutdownTelemetryRecorded = false;
  const pendingTaskEvidence = new Map<string, { decisionId: string; evidence: EvidenceLane[] }>();
  const pendingMutations = new Map<string, string>();
  const pendingToolTelemetry = new Map<string, { decisionId: string | null; toolName: string }>();
  async function activate(source: ActivationSource) {
    if (enforcementActive) return;
    await pi.appendEntry(ACTIVATION_STATE_TYPE, { workflow: "ompstack", source });
    enforcementActive = true;
  }
  async function recordToolCall(event: ToolCallEvent, decisionId: string | null, disposition: "allowed" | "blocked", reason?: string) {
    await pi.appendEntry(TOOL_EVENT_TYPE, {
      phase: "call",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      decisionId,
      disposition,
      reason: reason ?? null,
      paths: mutationPaths(event),
    });
    if (disposition === "allowed") pendingToolTelemetry.set(event.toolCallId, { decisionId, toolName: event.toolName });
  }
  async function recordToolEnd(event: { toolCallId: string; toolName: string; result: unknown; isError: boolean }) {
    const pending = pendingToolTelemetry.get(event.toolCallId);
    pendingToolTelemetry.delete(event.toolCallId);
    if (!pending) return;
    await pi.appendEntry(TOOL_EVENT_TYPE, {
      phase: "end",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      decisionId: pending.decisionId,
      outcome: event.isError ? "error" : "success",
      references: resultReferences(event.toolName, event.result),
    });
  }
  async function recordBlock(event: ToolCallEvent, reason: string, decisionId: string | null, path?: string | null) {
    const inputPath = record(event.input)?.path;
    const blockPath = path === undefined ? (typeof inputPath === "string" && inputPath !== "" ? inputPath : null) : path;
    await pi.appendEntry(BLOCK_STATE_TYPE, {
      toolName: event.toolName,
      reason,
      decisionId,
      path: blockPath,
    });
    return { block: true, reason };
  }
  async function invalidateActiveDecision(reason: string) {
    if (activeDecision) {
      await pi.appendEntry(DECISION_STATE_TYPE, { decisionId: activeDecision.decisionId, state: "invalidated", reason });
      activeDecision = null;
      materialRouteCurrent = false;
      observedEvidence = new Set();
    }
    pendingTaskEvidence.clear();
    pendingMutations.clear();
  }

  async function markMaterialRouteStale(decisionId: string) {
    if (activeDecision?.decisionId !== decisionId || !materialRouteCurrent) return;
    await pi.appendEntry(DECISION_STATE_TYPE, { decisionId, state: "material-stale", reason: "workspace-mutation-after-route" });
    if (activeDecision?.decisionId !== decisionId) return;
    materialRouteCurrent = false;
    observedEvidence = new Set();
    pendingTaskEvidence.clear();
  }
  async function observeEvidence(decisionId: string, evidence: EvidenceLane) {
    if (activeDecision?.decisionId !== decisionId || !requiredEvidence(activeDecision).includes(evidence) || observedEvidence.has(evidence)) return;
    if (activeDecision.measurementPurpose === "material" && !materialRouteCurrent) return;
    await pi.appendEntry(EVIDENCE_STATE_TYPE, { decisionId, evidence });
    if (activeDecision?.decisionId !== decisionId) return;
    observedEvidence.add(evidence);
  }

  function rebuild(ctx: SessionContext) {
    enforcementActive = false;
    activeDecision = null;
    materialRouteCurrent = false;
    routeSkipRecorded = false;
    observedEvidence = new Set();
    lastCloseoutPassed = false;
    shutdownTelemetryRecorded = false;
    pendingTaskEvidence.clear();
    pendingMutations.clear();
    pendingToolTelemetry.clear();
    for (const entry of ctx.sessionManager.getBranch()) {
      const item = record(entry);
      if (item?.type !== "custom") continue;
      if (item.customType === SKIP_STATE_TYPE && isRouteSkipState(item.data)) routeSkipRecorded = true;
      if (item.customType === ACTIVATION_STATE_TYPE && isActivationState(item.data)) enforcementActive = true;
      if (item.customType === DECISION_TYPE && isDecision(item.data)) {
        enforcementActive = true;
        activeDecision = item.data;
        materialRouteCurrent = item.data.measurementPurpose === "material";
        observedEvidence = new Set();
        lastCloseoutPassed = false;
      }
      if (item.customType === EVIDENCE_STATE_TYPE && isEvidenceState(item.data) && activeDecision?.decisionId === item.data.decisionId) {
        const evidence = canonicalEvidence(item.data.evidence);
        if (evidence !== undefined && (activeDecision.measurementPurpose === "bootstrap" || materialRouteCurrent) && requiredEvidence(activeDecision).includes(evidence)) observedEvidence.add(evidence);
      }
      if (item.customType === DECISION_STATE_TYPE && isDecisionState(item.data) && activeDecision?.decisionId === item.data.decisionId) {
        enforcementActive = true;
        if (item.data.state === "invalidated") {
          activeDecision = null;
          materialRouteCurrent = false;
          observedEvidence = new Set();
          lastCloseoutPassed = false;
        } else {
          materialRouteCurrent = false;
          observedEvidence = new Set();
          lastCloseoutPassed = false;
      }
      }
      const closeout = record(item.data);
      if (item.customType === CLOSEOUT_TYPE && closeout?.status === "ready" && activeDecision !== null && closeout.decisionId === activeDecision.decisionId) lastCloseoutPassed = true;
    }
  }

  pi.on("session_start", (_event, ctx) => rebuild(ctx));
  pi.on("session_switch", (_event, ctx) => rebuild(ctx));
  pi.on("session_branch", (_event, ctx) => rebuild(ctx));
  pi.on("session_tree", (_event, ctx) => rebuild(ctx));
  pi.on("before_agent_start", async (event) => {
    const slashToken = /(?:^|\s)\/(?:skill:)?ompstack(?:\s|$)/.test(event.prompt);
    const markerPresent = event.prompt.includes(ACTIVATION_MARKER) || (Array.isArray(event.systemPrompt) && event.systemPrompt.some((prompt) => prompt.includes(ACTIVATION_MARKER)));
    if (markerPresent) await activate("marker");
    else if (slashToken) await activate("input");
  });
  pi.on("input", async (event) => {
    if (/(?:^|\s)\/(?:skill:)?ompstack(?:\s|$)/.test(event.text)) await activate("input");
  });

  const repositorySchema = z.object({
    root: z.string().min(1),
    base: z.string().min(1),
    head: z.string().min(1),
    scratchPaths: z.array(z.string()).optional(),
  }).strict();

  pi.registerTool({
    name: "ompstack_route",

    label: "Route repository change",
    description: "Measure the checked-out working tree against a declared baseline and persist its RouteDecision.",
    parameters: z.object({
      intent: z.enum(["investigation", "bug-fix", "feature", "refactoring", "prototype", "perf-issue", "runtime-forensics", "trace-forensics", "eval"]),
      targets: z.array(z.string()).min(1),
      taskFacts: z.object({
        behaviorAffecting: z.boolean().describe("Whether the change alters observable product behavior. Use false only for documentation, changelogs, CI configuration, or formatting-only changes; when uncertain, use true."),
      }).strict(),
      repository: repositorySchema,
      riskFacts: z.object({
        sharedSemanticBoundary: z.boolean().describe("Whether the change touches a contract relied on by multiple callers, such as a schema, wire format, or public signature."),
        consumerFamilies: z.number().int().nonnegative().describe("Number of independent caller families for the changed surface, not call sites. Ten calls from one module count as one; use materialUnknown when not directly inspected."),
        executionModes: z.number().int().nonnegative().describe("Number of execution modes affected by the change, such as sync/async, CLI/server, or single/concurrent."),
        graphTraversal: z.boolean().describe("Whether the change modifies graph traversal, recursion, or reachability logic."),
        materialUnknown: z.boolean().describe("Set true when the changed surface has not been directly inspected. This declares investigation coverage, not a property of the code."),
      }).strict(),
      graphPolicy: z.object({ sourceRoots: z.object({ go: z.array(z.string()), python: z.array(z.string()), typescript: z.array(z.string()), java: z.array(z.string()) }).strict() }).strict(),
    }).strict(),
    async execute(_id, input) {
      await activate("route-call");
      const decision = await routeRepository(input as RouteInput);
      await invalidateActiveDecision("superseded-by-fresh-route");
      await pi.appendEntry(DECISION_TYPE, decision);
      enforcementActive = true;
      activeDecision = decision;
      materialRouteCurrent = decision.measurementPurpose === "material";
      observedEvidence = new Set();
      lastCloseoutPassed = false;
      shutdownTelemetryRecorded = false;
      const capabilities = await verificationCapabilities(decision.repositoryRoot);
      const required = requiredEvidence(decision);
      const scratch = decision.scratchPaths ?? [];
      const verificationText = capabilities.length > 0 ? `detected capabilities: ${capabilities.join(", ")}` : "fallback surface: repository-native original reproduction or narrowest relevant regression command";
      const text = [
        `Route-Decision: sha256:${decision.decisionId}`,
        "Decision hash is not an artifact URI; use it only as the exact task-binding header.",
        `Risk budget: effective=${decision.riskBudget?.effective ?? decision.risk ?? "unknown"} measured=${decision.riskBudget?.measured ?? decision.measuredRisk ?? decision.risk ?? "unknown"} reserved=${decision.riskBudget?.reserved ?? "unknown"}`,
        `Required evidence: ${required.join(", ") || "none"}`,
        `Scratch paths: ${scratch.join(", ") || "none"}`,
        `Verification: ${verificationText}`,
      ].join("\n");
      return { content: [{ type: "text", text }], details: { ...decision, verificationCapabilities: capabilities, verificationFallback: capabilities.length === 0 ? "repository-native original reproduction or narrowest relevant regression command" : null } };
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

  function closeoutState() {
    const routeCurrent = activeDecision !== null && (activeDecision.measurementPurpose === "bootstrap" || materialRouteCurrent);
    const required = requiredEvidence(activeDecision);
    const observed = [...observedEvidence].sort();
    const missing = required.filter((evidence) => !observed.includes(evidence));
    const reasons: string[] = [];
    if (!routeCurrent) reasons.push(activeDecision === null ? "missing current RouteDecision" : "current RouteDecision is stale");
    if (missing.length > 0) reasons.push(`missing independent evidence: ${missing.join(", ")}`);
    return { routeCurrent, required, observed, missing, reason: reasons.join("; ") || "closeout ready" };
  }
  pi.on("session_stop", async () => {
    if (!enforcementActive) return;
    const state = closeoutState();
    const ready = state.routeCurrent && state.missing.length === 0;
    await pi.appendEntry(CLOSEOUT_TYPE, {
      status: ready ? "ready" : "blocked",
      decisionId: activeDecision?.decisionId ?? null,
      routeCurrent: state.routeCurrent,
      requiredEvidence: state.required,
      observedEvidence: state.observed,
      missingEvidence: state.missing,
      reason: state.reason,
    });
    lastCloseoutPassed = ready;
    if (ready) return;
    return {
      continue: true,
      decision: "block",
      reason: `Ompstack closeout blocked: ${state.reason}`,
      additionalContext: `Before settling, establish a current RouteDecision and independent evidence. Missing: ${state.reason}.`,
    };
  });
  pi.on("session_shutdown", async () => {
    if (!enforcementActive || lastCloseoutPassed || shutdownTelemetryRecorded) return;
    const state = closeoutState();
    shutdownTelemetryRecorded = true;
    await pi.appendEntry(CLOSEOUT_TYPE, {
      status: "shutdown",
      decisionId: activeDecision?.decisionId ?? null,
      routeCurrent: state.routeCurrent,
      requiredEvidence: state.required,
      observedEvidence: state.observed,
      missingEvidence: state.missing,
      reason: `session shutdown before closeout: ${state.reason}`,
    });
  });

  pi.on("tool_call", async (event) => {
    const inputPath = record(event.input)?.path;
    if (event.toolName === "read" && inputPath === "skill://ompstack") await activate("skill-read");
    const decisionId = activeDecision?.decisionId ?? null;
    if (isReadOnlyTool(event)) {
      if (enforcementActive) await recordToolCall(event, decisionId, "allowed");
      return;
    }
    if (!enforcementActive) {
      if (!routeSkipRecorded) {
        routeSkipRecorded = true;
        await pi.appendEntry(SKIP_STATE_TYPE, { reason: "enforcement-inactive", firstToolName: event.toolName });
      }
      return;
    }
    if (!activeDecision) {
      const reason = "ompstack requires a valid RouteDecision before mutable or unknown execution";
      await recordToolCall(event, null, "blocked", reason);
      return recordBlock(event, reason, null);
    }
    const scopeViolation = event.toolName === "write" || event.toolName === "edit" ? await outsideDeclaredScope(activeDecision, event) : undefined;
    if (scopeViolation) {
      await recordToolCall(event, activeDecision.decisionId, "blocked", scopeViolation.reason);
      return recordBlock(event, scopeViolation.reason, activeDecision.decisionId, scopeViolation.path);
    }
    if (event.toolName === "write" || event.toolName === "edit") {
      await recordToolCall(event, activeDecision.decisionId, "allowed");
      if (mutationChangesRepository(activeDecision, event)) pendingMutations.set(event.toolCallId, activeDecision.decisionId);
      return;
    }
    if (event.toolName !== "task") {
      await recordToolCall(event, activeDecision.decisionId, "allowed");
      return;
    }
    if (!taskBindsDecision(event.input, activeDecision.decisionId)) {
      const reason = "task requires an exact Route-Decision header";
      await recordToolCall(event, activeDecision.decisionId, "blocked", reason);
      return recordBlock(event, reason, activeDecision.decisionId);
    }
    const evidence = requestedEvidence(event.input).filter((lane) => requiredEvidence(activeDecision).includes(lane));
    if (evidence.length && activeDecision.measurementPurpose === "material" && !materialRouteCurrent) {
      const reason = "task requires a fresh material RouteDecision before independent evidence";
      await recordToolCall(event, activeDecision.decisionId, "blocked", reason);
      return recordBlock(event, reason, activeDecision.decisionId);
    }
    await recordToolCall(event, activeDecision.decisionId, "allowed");
    if (evidence.length) pendingTaskEvidence.set(event.toolCallId, { decisionId: activeDecision.decisionId, evidence });
  });

  pi.on("tool_execution_end", async (event) => {
    await recordToolEnd(event);
    if (event.toolName === "write" || event.toolName === "edit") {
      const decisionId = pendingMutations.get(event.toolCallId);
      pendingMutations.delete(event.toolCallId);
      if (!event.isError && decisionId !== undefined && decisionId === activeDecision?.decisionId) await markMaterialRouteStale(decisionId);
    }
    if (event.toolName !== "task") return;
    const pending = pendingTaskEvidence.get(event.toolCallId);
    pendingTaskEvidence.delete(event.toolCallId);
    if (!pending) return;
    await pi.appendEntry(EVIDENCE_ATTEMPT_TYPE, {
      decisionId: pending.decisionId,
      evidence: pending.evidence,
      toolCallId: event.toolCallId,
      outcome: event.isError ? "error" : "success",
      references: resultReferences(event.toolName, event.result),
    });
    if (event.isError) return;
    for (const evidence of pending.evidence) await observeEvidence(pending.decisionId, evidence);
  });

}
