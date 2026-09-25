import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  BeforeSubagentSpawnEvent,
  ExtensionAPI,
  ExtensionContext,
  ExtensionEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "@oh-my-pi/pi-coding-agent";
import path from "node:path";
import { registerCommands, parseModeFlag } from "./commands.js";
import { enforcePstackChildToolPolicy } from "./child-policy.js";
import { computeArtifactFingerprint } from "./fingerprint.js";
import { evaluateCompletionGates, renderGateReport } from "./gates.js";
import { isHeadless, renderHeadlessOpenGates, signalOpenGatesOnExit, writeStderr } from "./headless.js";
import { currentGoal, goalFromValue } from "./goal.js";
import { chooseModelPatterns, modelFamilyForPatterns, roleForAgent } from "./model-routing.js";
import { buildPolicySegment, stripPstackPolicy } from "./policy.js";
import { ingestStructuredTaskResults } from "./result-ingestion.js";
import { classifyTask } from "./router.js";
import { isMainSession } from "./session-kind.js";
import { PstackStore } from "./store.js";
import { rewriteTaskInput, taskInputContainsAgent } from "./task-rewrite.js";
import { expectedTaskSpawns, extractTaskItems, TaskLifecycleTracker } from "./task-lifecycle.js";
import { registerPstackTools } from "./tools.js";
import { createId, isRecord, nowIso } from "./utils.js";
import { DEFAULT_CONFIG, stopGateBudget, type PstackSessionState } from "./domain.js";
import type { ChangeBaseline, EngagementFinding } from "./engagement.js";
import {
  appendSessionAudit, diffTrees, engagedSince, exceedsDirectBudget, renderEngagementFinding, snapshotWorkingTree,
} from "./engagement.js";

/** OMP 18.2.11 does not re-export `GoalUpdatedEvent` from the package root. */
type GoalUpdatedEvent = Extract<ExtensionEvent, { type: "goal_updated" }>;

function toolNameOf(event: ToolCallEvent | ToolResultEvent): string {
  return event.toolName.trim().toLowerCase();
}

function toolResultText(event: ToolResultEvent): string {
  return event.content
    .map(item => isRecord(item) && typeof item.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n");
}

function sessionIdOf(ctx: ExtensionContext): string {
  try {
    return ctx.sessionManager.getSessionId();
  } catch {
    return `cwd:${ctx.cwd}`;
  }
}

function sessionKey(ctx: ExtensionContext): string {
  return `${sessionIdOf(ctx)}\0${path.resolve(ctx.cwd)}`;
}
/** OMP tools that write files directly; bash and task calls wait for a baseline transition too. */
const WRITE_TOOLS = new Set(["edit", "write", "ast_edit"]);

const BASELINE_CAPTURE_TIMEOUT_MS = 5_000;
const FINDING_SCAN_TIMEOUT_MS = 5_000;
const HEADLESS_FINDING_TIMEOUT_MS = 750;
const HEADLESS_SHUTDOWN_BASELINE_TIMEOUT_MS = 750;
const HEADLESS_AUDIT_TIMEOUT_MS = 100;

interface BaselineToken {
  epoch: number;
  baseline: ChangeBaseline;
}

interface CachedFinding {
  epoch: number;
  baseline: ChangeBaseline;
  finding: EngagementFinding;
}

interface PendingEpoch {
  epoch: number;
  promise: Promise<void>;
  resolve: () => void;
}

interface BaselineFailure {
  epoch: number;
  kind: "unavailable" | "indeterminate";
  at: string;
}

function createPendingEpoch(epoch: number): PendingEpoch {
  let resolve = () => {};
  const promise = new Promise<void>(value => { resolve = value; });
  return { epoch, promise, resolve };
}

function unwrapHashlineHeaderPath(target: string): string {
  const trimmed = target.trimEnd();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return target;
  const inner = trimmed.slice(1, -1);
  const tag = /#[0-9A-Fa-f]{4}$/.exec(inner);
  const pathPart = tag ? inner.slice(0, tag.index) : inner;
  return pathPart.length > 0 && !pathPart.includes("#") ? pathPart : target;
}

function isInternalWriteTarget(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(unwrapHashlineHeaderPath(target).trim());
}

function isWorkspaceWrite(event: ToolCallEvent): boolean {
  const tool = toolNameOf(event);
  if (!WRITE_TOOLS.has(tool)) return false;
  const input: unknown = event.input;
  if (tool === "ast_edit") {
    const paths = isRecord(input) && Array.isArray(input.paths) ? input.paths : [];
    return paths.length === 0 || paths.some((path: unknown) => typeof path !== "string" || !isInternalWriteTarget(path));
  }
  if (!isRecord(input) || typeof input.path !== "string") return true;
  return !isInternalWriteTarget(input.path);
}

async function withDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T | undefined> {
  if (timeoutMs <= 0) return undefined;
  const controller = new AbortController();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<undefined>(resolve => {
    onAbort = () => resolve(undefined);
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  const timer = setTimeout(() => {
    onTimeout?.();
    controller.abort();
  }, timeoutMs);
  try {
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)), aborted]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    if (onAbort) controller.signal.removeEventListener("abort", onAbort);
    controller.abort();
  }
}

export default function pstackExtension(api: ExtensionAPI): void {
  const store = new PstackStore(api);
  const lifecycle = new TaskLifecycleTracker();
  const reconcile = async (ctx: ExtensionContext): Promise<void> => {
    await lifecycle.reconcile(ctx, store);
  };

  api.registerFlag("pstack-mode", {
    description: "Override pstack mode for this OMP session: off, auto, or strict",
    type: "string",
    default: "",
  });

  registerPstackTools(api, store, reconcile);
  registerCommands(api, store, reconcile, async (ctx, mode, _previous, phase, token) => {
    const key = phase === "before"
      ? activateWorkspace(ctx)
      : [...modeTransitions.entries()].find(([, pending]) => pending.epoch === token)?.[0] ?? sessionKey(ctx);
    if (phase === "before") {
      const epoch = beginBaseline(key);
      if (mode === "off") {
        clearBaseline(key);
        return epoch;
      }
      try {
        await captureBaseline(ctx, epoch, true);
      } catch (error) {
        if (baselineEpoch.get(key) === epoch) invalidateBaseline(key, epoch);
        api.logger.warn("pstack: engagement baseline failed", { error: String(error) });
      }
      return epoch;
    }
    const transition = modeTransitions.get(key);
    if (token !== undefined && baselineEpoch.get(key) === token && transition?.epoch === token) {
      modeTransitions.delete(key);
      transition.resolve();
    }
    return token;
  });

  const hydrate = async (_event: unknown, ctx: ExtensionContext): Promise<void> => {
    if (!isMainSession(ctx)) return;
    const bucket = await store.hydrate(ctx);
    const flagged = parseModeFlag(api.getFlag("pstack-mode"));
    if (flagged && bucket.state.mode !== flagged) {
      await store.mutate(ctx, { type: "set_mode", mode: flagged, at: nowIso() }, "mode_from_cli_flag");
    }
  };

  const baselines = new Map<string, ChangeBaseline>();
  const baselineEpoch = new Map<string, number>();
  const baselineStartedAt = new Map<string, { epoch: number; at: string }>();
  const baselineFailures = new Map<string, BaselineFailure>();
  const baselinePending = new Set<string>();
  const baselineWaiters = new Map<string, PendingEpoch>();
  const modeTransitions = new Map<string, PendingEpoch>();
  const routedDirect = new Map<string, boolean>();
  const tripwireBlocks = new Map<string, number>();
  const reportedChanges = new Set<string>();
  const findings = new Map<string, CachedFinding>();
  const unknownFindings = new Set<string>();
  const activeWorkspaceKeys = new Map<string, string>();
  const clearBaseline = (key: string): void => {
    baselineFailures.delete(key);
    baselineStartedAt.delete(key);
    baselinePending.delete(key);
    const baselineWaiter = baselineWaiters.get(key);
    if (baselineWaiter) {
      baselineWaiters.delete(key);
      baselineWaiter.resolve();
    }
    const modeTransition = modeTransitions.get(key);
    if (modeTransition) {
      modeTransitions.delete(key);
      modeTransition.resolve();
    }
    routedDirect.delete(key);
    tripwireBlocks.delete(key);
    reportedChanges.delete(key);
    findings.delete(key);
    unknownFindings.delete(key);
  };

  const activateWorkspace = (ctx: ExtensionContext): string => {
    const owner = sessionIdOf(ctx);
    const key = sessionKey(ctx);
    const previous = activeWorkspaceKeys.get(owner);
    if (previous && previous !== key) {
      lifecycle.dropSession(previous);
      clearBaseline(previous);
      baselineEpoch.delete(previous);
    }
    activeWorkspaceKeys.set(owner, key);
    return key;
  };
  const beginBaseline = (key: string): number => {
    const epoch = (baselineEpoch.get(key) ?? 0) + 1;
    baselineEpoch.set(key, epoch);
    clearBaseline(key);
    baselinePending.add(key);
    baselineWaiters.set(key, createPendingEpoch(epoch));
    baselineStartedAt.set(key, { epoch, at: nowIso() });
    return epoch;
  };

  const invalidateBaseline = (
    key: string,
    epoch: number,
    failure?: BaselineFailure["kind"],
  ): void => {
    if (baselineEpoch.get(key) !== epoch) return;
    const nextEpoch = epoch + 1;
    const started = baselineStartedAt.get(key);
    baselineEpoch.set(key, nextEpoch);
    clearBaseline(key);
    if (failure) baselineFailures.set(key, { epoch: nextEpoch, kind: failure, at: started?.at ?? nowIso() });
  };

  const currentBaselineToken = (key: string): BaselineToken | undefined => {
    const epoch = baselineEpoch.get(key);
    const baseline = baselines.get(key);
    const failure = baselineFailures.get(key);
    return epoch === undefined || !baseline || failure?.epoch === epoch ? undefined : { epoch, baseline };
  };
  const waitForBaseline = async (key: string, deadlineAt?: number): Promise<boolean> => {
    while (true) {
      const pending = modeTransitions.get(key) ?? baselineWaiters.get(key);
      if (!pending) return true;
      if (deadlineAt === undefined) {
        await pending.promise;
        continue;
      }
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) return false;
      let timer: NodeJS.Timeout | undefined;
      try {
        const outcome = await Promise.race([
          pending.promise.then(() => "done" as const),
          new Promise<"timeout">(resolve => {
            timer = setTimeout(() => resolve("timeout"), remaining);
          }),
        ]);
        if (outcome === "timeout") return false;
      } finally {
        clearTimeout(timer);
      }
    }
  };
  const abandonPendingBaseline = (key: string): boolean => {
    const epoch = baselineEpoch.get(key);
    if (
      epoch === undefined
      || (!baselinePending.has(key) && !baselineWaiters.has(key) && !modeTransitions.has(key))
    ) return false;
    invalidateBaseline(key, epoch, "indeterminate");
    return true;
  };

  const isCurrentBaseline = (key: string, token: BaselineToken): boolean =>
    baselineEpoch.get(key) === token.epoch && baselines.get(key) === token.baseline;

  const cachedFindingFor = (key: string, token: BaselineToken): EngagementFinding | undefined => {
    const cached = findings.get(key);
    return cached?.epoch === token.epoch && cached.baseline === token.baseline ? cached.finding : undefined;
  };

  const captureBaseline = async (
    ctx: ExtensionContext,
    expectedEpoch: number,
    allowOff = false,
    parentSignal?: AbortSignal,
  ): Promise<boolean> => {
    const key = sessionKey(ctx);
    if (!isMainSession(ctx)) return false;
    const bucket = await store.get(ctx);
    if (
      !bucket.config.engagementTripwire
      || (!allowOff && bucket.state.mode === "off")
      || baselineEpoch.get(key) !== expectedEpoch
    ) {
      if (baselineEpoch.get(key) === expectedEpoch) clearBaseline(key);
      return false;
    }
    let timedOut = false;
    const tree = parentSignal
      ? await snapshotWorkingTree(api, ctx.cwd, bucket.config, parentSignal)
      : await withDeadline(
        signal => snapshotWorkingTree(api, ctx.cwd, bucket.config, signal),
        BASELINE_CAPTURE_TIMEOUT_MS,
        () => { timedOut = true; },
      );
    if (baselineEpoch.get(key) !== expectedEpoch) return false;
    if (parentSignal?.aborted) {
      invalidateBaseline(key, expectedEpoch, "indeterminate");
      return false;
    }
    if (!tree) {
      invalidateBaseline(key, expectedEpoch, timedOut ? "indeterminate" : "unavailable");
      return false;
    }
    const started = baselineStartedAt.get(key);
    baselines.set(key, { tree, at: started?.epoch === expectedEpoch ? started.at : nowIso() });
    baselineStartedAt.delete(key);
    baselinePending.delete(key);
    const waiter = baselineWaiters.get(key);
    if (waiter?.epoch === expectedEpoch) {
      baselineWaiters.delete(key);
      waiter.resolve();
    }
    return true;
  };

  const getStore = async (ctx: ExtensionContext, deadlineAt?: number) => {
    if (deadlineAt === undefined) return store.get(ctx);
    const remaining = Math.max(1, deadlineAt - Date.now());
    return await withDeadline(() => store.get(ctx), remaining);
  };
  const ensureBaseline = async (ctx: ExtensionContext, deadlineAt?: number): Promise<boolean> => {
    if (!isMainSession(ctx)) return false;
    const key = activateWorkspace(ctx);
    if (baselineEpoch.has(key)) {
      const ready = await waitForBaseline(key, deadlineAt);
      if (!ready) abandonPendingBaseline(key);
      return ready;
    }
    const bucket = await getStore(ctx, deadlineAt);
    if (!bucket) return false;
    if (baselineEpoch.has(key)) {
      const ready = await waitForBaseline(key, deadlineAt);
      if (!ready) abandonPendingBaseline(key);
      return ready;
    }
    const epoch = beginBaseline(key);
    if (!bucket.config.engagementTripwire || bucket.state.mode === "off") {
      clearBaseline(key);
      return true;
    }
    if (deadlineAt !== undefined) {
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) {
        invalidateBaseline(key, epoch, "indeterminate");
        return false;
      }
      const captured = await withDeadline(
        signal => captureBaseline(ctx, epoch, false, signal),
        remaining,
      );
      if (captured !== true && baselineEpoch.get(key) === epoch && baselinePending.has(key)) {
        invalidateBaseline(key, epoch, "indeterminate");
      }
      return captured === true;
    }
    return await captureBaseline(ctx, epoch);
  };

  const findUnengagedChange = async (
    ctx: ExtensionContext,
    timeoutMs = FINDING_SCAN_TIMEOUT_MS,
  ): Promise<EngagementFinding | undefined> => {
    const key = sessionKey(ctx);
    const token = currentBaselineToken(key);
    if (!token) {
      findings.delete(key);
      unknownFindings.delete(key);
      return undefined;
    }
    const cached = cachedFindingFor(key, token);
    const bucket = await store.get(ctx);
    if (!isCurrentBaseline(key, token)) return undefined;
    if (!bucket.config.engagementTripwire || bucket.state.mode === "off") {
      findings.delete(key);
      return undefined;
    }
    if (engagedSince(bucket.state, token.baseline.at)) {
      findings.delete(key);
      return undefined;
    }
    const deadlineAt = Date.now() + timeoutMs;
    const now = await withDeadline(
      signal => snapshotWorkingTree(api, ctx.cwd, bucket.config, signal),
      Math.max(1, deadlineAt - Date.now()),
    );
    if (!isCurrentBaseline(key, token)) return undefined;
    const afterSnapshot = await store.get(ctx);
    if (!isCurrentBaseline(key, token)) return undefined;
    if (!afterSnapshot.config.engagementTripwire || afterSnapshot.state.mode === "off" || engagedSince(afterSnapshot.state, token.baseline.at)) {
      findings.delete(key);
      return undefined;
    }
    if (!now) {
      if (!cached) unknownFindings.add(key);
      return cached;
    }
    const stat = await withDeadline(
      signal => diffTrees(api, ctx.cwd, token.baseline.tree, now, signal),
      Math.max(1, deadlineAt - Date.now()),
    );
    if (!isCurrentBaseline(key, token)) return undefined;
    const latest = await store.get(ctx);
    if (!isCurrentBaseline(key, token)) return undefined;
    if (!latest.config.engagementTripwire || latest.state.mode === "off" || engagedSince(latest.state, token.baseline.at)) {
      findings.delete(key);
      return undefined;
    }
    if (!stat) {
      if (!cached) unknownFindings.add(key);
      return cached;
    }
    if (!exceedsDirectBudget(stat, latest.config)) {
      unknownFindings.delete(key);
      findings.delete(key);
      return undefined;
    }
    unknownFindings.delete(key);
    const finding = {
      stat,
      budget: { files: latest.config.directMaxFiles, lines: latest.config.directMaxLines },
    };
    findings.set(key, { epoch: token.epoch, baseline: token.baseline, finding });
    return finding;
  };
  const recordUnengagedChange = async (
    ctx: ExtensionContext,
    finding: EngagementFinding,
    headless: boolean,
    exitCode?: number,
    expected?: BaselineToken,
  ): Promise<boolean> => {
    const key = sessionKey(ctx);
    if (expected && !isCurrentBaseline(key, expected)) return false;
    if (reportedChanges.has(key)) return true;
    reportedChanges.add(key);
    const bucket = await store.get(ctx);
    if (
      expected
      && (
        !isCurrentBaseline(key, expected)
        || bucket.state.mode === "off"
        || engagedSince(bucket.state, expected.baseline.at)
      )
    ) {
      reportedChanges.delete(key);
      return false;
    }
    await appendSessionAudit(ctx.cwd, bucket.config, "unengaged_change", {
      ...finding,
      ...(exitCode !== undefined ? { exitCode } : {}),
      headless,
      mode: bucket.state.mode,
    });
    const latest = await store.get(ctx);
    if (
      expected
      && (
        !isCurrentBaseline(key, expected)
        || latest.state.mode === "off"
        || engagedSince(latest.state, expected.baseline.at)
      )
    ) {
      reportedChanges.delete(key);
      return false;
    }
    return true;
  };

  const hydrateAndCapture = async (event: unknown, ctx: ExtensionContext): Promise<void> => {
    if (!isMainSession(ctx)) return;
    const key = activateWorkspace(ctx);
    const epoch = beginBaseline(key);
    const captured = await withDeadline(async signal => {
      await hydrate(event, ctx);
      if (signal.aborted) return false;
      return captureBaseline(ctx, epoch, false, signal);
    }, BASELINE_CAPTURE_TIMEOUT_MS);
    if (!captured && baselineEpoch.get(key) === epoch && baselinePending.has(key)) {
      invalidateBaseline(key, epoch, "indeterminate");
    }
  };

  api.on("session_start", hydrateAndCapture);
  api.on("session_switch", hydrateAndCapture);
  api.on("session_branch", hydrateAndCapture);
  api.on("session_tree", hydrateAndCapture);
  const reportHeadlessOpenRun = async (ctx: ExtensionContext): Promise<void> => {
    if (!isMainSession(ctx) || !isHeadless(ctx)) return;
    const shutdownDeadlineAt = Date.now() + HEADLESS_SHUTDOWN_BASELINE_TIMEOUT_MS;
    const baselineReady = await ensureBaseline(ctx, shutdownDeadlineAt);
    const key = sessionKey(ctx);
    if (!baselineReady) abandonPendingBaseline(key);
    if (!(await waitForBaseline(key, shutdownDeadlineAt))) abandonPendingBaseline(key);
    const bucket = await getStore(ctx, shutdownDeadlineAt);
    if (!bucket) {
      const exitCode = DEFAULT_CONFIG.headlessOpenGateExitCode;
      writeStderr(`pstack: could not load session state before headless shutdown. Exit status ${exitCode} signals an indeterminate unverified-work check.`);
      signalOpenGatesOnExit(exitCode);
      return;
    }
    if (bucket.state.mode === "off") return;
    const run = bucket.state.activeRun;

    const reportIndeterminate = async (
      message: string,
      expectedFailure?: BaselineFailure,
      expectedToken?: BaselineToken,
    ): Promise<void> => {
      const valid = (state: PstackSessionState): boolean => {
        if (state.mode === "off" || state.activeRun?.status === "active") return false;
        if (expectedFailure) {
          return baselineFailures.get(key) === expectedFailure
            && baselineEpoch.get(key) === expectedFailure.epoch
            && !engagedSince(state, expectedFailure.at);
        }
        return expectedToken !== undefined
          && isCurrentBaseline(key, expectedToken)
          && !engagedSince(state, expectedToken.baseline.at);
      };
      const before = await store.get(ctx);
      if (!valid(before.state)) return;
      const exitCode = before.config.headlessOpenGateExitCode;
      writeStderr([
        message,
        exitCode > 0
          ? `Exit status ${exitCode} signals an indeterminate unverified-work check.`
          : "Exit status unchanged (headlessOpenGateExitCode is 0).",
      ].join("\n"));
      signalOpenGatesOnExit(exitCode);
      await withDeadline(
        () => appendSessionAudit(ctx.cwd, before.config, "unengaged_scan_incomplete", {
          headless: true,
          reason: message,
        }),
        HEADLESS_AUDIT_TIMEOUT_MS,
      );
    };
    if (!run || run.status !== "active") {
      const token = currentBaselineToken(key);
      if (!token) {
        const failure = baselineFailures.get(key);
        if (failure?.kind === "indeterminate") {
          await reportIndeterminate("pstack: engagement tripwire could not establish a Git baseline before headless shutdown.", failure);
        }
        return;
      }
      if (engagedSince(bucket.state, token.baseline.at)) {
        findings.delete(key);
        unknownFindings.delete(key);
        return;
      }
      const finding = await findUnengagedChange(ctx, HEADLESS_FINDING_TIMEOUT_MS);
      if (!finding || !isCurrentBaseline(key, token)) {
        if (!finding && unknownFindings.has(key)) {
          await reportIndeterminate("pstack: engagement tripwire could not complete its Git scan before headless shutdown.", undefined, token);
        }
        return;
      }
      const latestBucket = await store.get(ctx);
      if (
        latestBucket.state.mode === "off"
        || latestBucket.state.activeRun?.status === "active"
        || engagedSince(latestBucket.state, token.baseline.at)
      ) {
        findings.delete(key);
        return;
      }
      const exitCode = latestBucket.config.headlessOpenGateExitCode;
      writeStderr([
        renderEngagementFinding(finding, true),
        exitCode > 0
          ? `Exit status ${exitCode} signals unverified work (set engagementTripwire to false or raise directMaxFiles/directMaxLines to change this).`
          : "Exit status unchanged (headlessOpenGateExitCode is 0).",
      ].join("\n"));
      signalOpenGatesOnExit(exitCode);
      await withDeadline(
        () => appendSessionAudit(ctx.cwd, latestBucket.config, "unengaged_change", {
          ...finding,
          exitCode,
          headless: true,
          mode: latestBucket.state.mode,
        }),
        HEADLESS_AUDIT_TIMEOUT_MS,
      );
      return;
    }
    // Background completions can arrive as notices rather than task/wait
    // results; settle them before judging the run's completion gates.
    await withDeadline(
      () => lifecycle.reconcile(ctx, store),
      Math.max(1, shutdownDeadlineAt - Date.now()),
    );
    const reconciledRun = bucket.state.activeRun;
    if (!reconciledRun || reconciledRun.status !== "active") return;
    const current = await withDeadline(
      signal => computeArtifactFingerprint(api, ctx.cwd, bucket.config, signal),
      Math.max(1, shutdownDeadlineAt - Date.now()),
    );
    const latest = await store.get(ctx);
    if (
      latest.state.mode === "off"
      || latest.state.activeRun?.status !== "active"
      || latest.state.activeRun.id !== reconciledRun.id
    ) return;
    const report = evaluateCompletionGates(latest.state, current, latest.config, { ignoreRunStatus: true });
    // Gates that pass but were never closed are reported, not failed: the work
    // may be done; only the bookkeeping is missing.
    const exitCode = report.allowed ? 0 : latest.config.headlessOpenGateExitCode;
    writeStderr(renderHeadlessOpenGates(reconciledRun, report, exitCode));
    signalOpenGatesOnExit(exitCode);
    await withDeadline(
      () => store.checkpoint(ctx, "headless_open_gates", {
        runId: reconciledRun.id,
        exitCode,
        issues: report.issues.map(item => item.code),
      }),
      HEADLESS_AUDIT_TIMEOUT_MS,
    );
  };

  api.on("session_shutdown", async (_event: unknown, ctx: ExtensionContext) => {
    try {
      await reportHeadlessOpenRun(ctx);
    } catch (error) {
      api.logger.warn("pstack: headless open-gate report failed", { error: String(error) });
    } finally {
      const key = sessionKey(ctx);
      lifecycle.dropSession(key);
      clearBaseline(key);
      baselineEpoch.delete(key);
      activeWorkspaceKeys.delete(sessionIdOf(ctx));
      store.clearSession(ctx);
    }
  });

  api.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext): Promise<BeforeAgentStartEventResult | undefined> => {
    if (!isMainSession(ctx)) return undefined;
    await lifecycle.reconcile(ctx, store);
    await ensureBaseline(ctx);
    const bucket = await store.get(ctx);
    const key = sessionKey(ctx);
    if (bucket.state.mode === "off") {
      routedDirect.delete(key);
      return undefined;
    }
    const routing = classifyTask(event.prompt || bucket.state.activeRun?.objective || "continue active engineering work");
    routedDirect.set(key, event.prompt ? routing.ceremony === "direct" : false);
    const segment = buildPolicySegment(bucket.state, routing, bucket.config, currentBaselineToken(key) !== undefined);
    return segment ? { systemPrompt: [...stripPstackPolicy(event.systemPrompt), segment] } : undefined;
  });

  api.on("before_subagent_spawn", async (event: BeforeSubagentSpawnEvent, ctx: ExtensionContext) => {
    if (!isMainSession(ctx)) return undefined;
    const bucket = await store.get(ctx);
    if (bucket.state.mode === "off") return undefined;
    const role = roleForAgent(event.agent);
    if (!role) return undefined;

    if (!bucket.state.activeRun && bucket.state.mode === "strict") {
      return {
        block: true,
        reason: "pstack strict mode requires an active run before pstack subagents are spawned. Use pstack_gate action=init or /pstack init.",
      };
    }

    const patterns = Array.isArray(event.patterns) ? event.patterns.filter(item => typeof item === "string") : [];
    const decision = chooseModelPatterns(ctx, event.agent, patterns, bucket.state.activeRun, bucket.config);
    const assignment = event.invocationKind === "task"
      ? lifecycle.assignSpawn(sessionKey(ctx), event.agent, event.spawnKey)
      : { actorId: event.spawnKey?.trim() || createId(`${role}-actor`) };
    const actorId = assignment.actorId;
    const effectivePatterns = decision.patterns ?? patterns;
    const modelFamily = decision.resolvedFamily ?? modelFamilyForPatterns(ctx, effectivePatterns);

    if (bucket.state.activeRun) {
      await store.mutate(ctx, {
        type: "record_agent",
        agent: {
          actorId,
          role,
          agentName: event.agent,
          invocationKind: event.invocationKind,
          modelPatterns: [...effectivePatterns],
          ...(modelFamily ? { modelFamily } : {}),
          ...(event.spawnKey ? { spawnKey: event.spawnKey } : {}),
          ...(assignment.toolCallId ? { toolCallId: assignment.toolCallId } : {}),
          status: event.invocationKind === "task" ? "spawned" : "unknown",
          spawnedAt: nowIso(),
          lastSeenAt: nowIso(),
        },
        at: nowIso(),
      }, "subagent_spawn");
    }

    return {
      ...(decision.patterns ? { model: decision.patterns } : {}),
      note: [
        decision.note,
        `pstack role=${role} actor=${actorId}`,
        role === "verifier" ? "Verifier must not edit the artifact and must bind any PASS to the tested fingerprint and evidence." : undefined,
      ].filter(Boolean).join("; "),
    };
  });

  api.on("tool_call", async (event: ToolCallEvent, ctx: ExtensionContext) => {
    const childPolicy = enforcePstackChildToolPolicy(event, ctx);
    if (childPolicy.handled) return childPolicy.result;
    const input: unknown = event.input;
    if (toolNameOf(event) === "goal" && isRecord(input) && input.op === "complete") {
      return gateGoalCompletion(ctx);
    }
    const tool = toolNameOf(event);
    const mainSession = isMainSession(ctx);
    if (mainSession && (tool === "bash" || tool === "task" || isWorkspaceWrite(event))) {
      await ensureBaseline(ctx);
      await waitForBaseline(sessionKey(ctx));
    }
    if (isWorkspaceWrite(event) && mainSession) {
      const key = sessionKey(ctx);
      await waitForBaseline(key);
      const bucket = await store.get(ctx);
      const baselineArming = baselinePending.has(key);
      const baselineReady = baselines.has(key) && !baselineFailures.has(key);
      const strictTripwire = (
        bucket.state.mode === "strict"
        && bucket.config.engagementTripwire
        && (baselineArming || baselineReady)
        && routedDirect.get(key) !== true
      );
      if (strictTripwire && bucket.state.activeRun?.status !== "active") {
        await appendSessionAudit(ctx.cwd, bucket.config, "unengaged_write_blocked", {
          tool,
          baselineArming,
        });
        const latest = await store.get(ctx);
        const latestBaselineArming = baselinePending.has(key);
        const latestBaselineReady = baselines.has(key) && !baselineFailures.has(key);
        const latestToken = currentBaselineToken(key);
        if (
          latest.state.mode !== "strict"
          || !latest.config.engagementTripwire
          || (!latestBaselineArming && !latestBaselineReady)
          || latest.state.activeRun?.status === "active"
          || routedDirect.get(key) === true
          || (latestToken !== undefined && engagedSince(latest.state, latestToken.baseline.at))
        ) {
          return undefined;
        }
        return {
          block: true,
          reason: latestBaselineArming
            ? "pstack strict mode is arming the engagement baseline; retry after it is ready, or open a run."
            : "pstack strict mode: open a run before editing. Call pstack_gate action=init with the playbook you chose from skill://pstack and acceptance criteria, then make the change.",
        };
      }
      return undefined;
    }
    if (toolNameOf(event) !== "task" || !isRecord(event.input)) return undefined;
    const bucket = await store.get(ctx);
    if (bucket.state.mode === "off") return undefined;

    if (bucket.state.mode === "strict" && taskInputContainsAgent(event.input, "pstack-verifier") && !bucket.state.activeRun) {
      return {
        block: true,
        reason: "pstack strict mode blocks verifier execution without an active run and frozen objective/acceptance criteria.",
      };
    }

    const fingerprint = bucket.state.activeRun ? await computeArtifactFingerprint(api, ctx.cwd, bucket.config) : undefined;
    const rewritten = rewriteTaskInput(event.input, {
      ...(bucket.state.activeRun ? { run: bucket.state.activeRun } : {}),
      ...(fingerprint ? { fingerprint } : {}),
    });
    const effectiveInput = rewritten.changed ? rewritten.input : event.input;
    if (expectedTaskSpawns(effectiveInput).some(item => roleForAgent(item.agentName))) {
      lifecycle.beginCall(sessionKey(ctx), event.toolCallId, effectiveInput);
    }
    if (!rewritten.changed) return undefined;
    await store.checkpoint(ctx, "task_rewritten", { reasons: rewritten.reasons, fingerprint: fingerprint?.digest, toolCallId: event.toolCallId });
    return { input: rewritten.input };
  });

  api.on("tool_result", async (event: ToolResultEvent, ctx: ExtensionContext) => {
    if (!isMainSession(ctx)) return undefined;
    const toolName = toolNameOf(event);
    const isWaitResult = toolName === "wait"
      || (toolName === "hub" && isRecord(event.input) && event.input.op === "wait");
    if (isWaitResult) {
      try {
        await lifecycle.reconcile(ctx, store);
        const actors = await lifecycle.reconcileTaskResultText(toolResultText(event), ctx, store);
        if (actors.length > 0) {
          await store.checkpoint(ctx, "task_result_reconciled", { actors, toolName });
        }
      } catch (error) {
        api.logger.warn("pstack: failed to reconcile async wait result", { error: String(error) });
      }
      return undefined;
    }
    if (toolName !== "task") return undefined;
    try {
      const actors = await lifecycle.applyTaskResult(sessionKey(ctx), event, ctx, store);
      const ingestion = await ingestStructuredTaskResults(event, ctx, store, api);
      // OMP owns isolation and silently drops `isolated` when task isolation is
      // disabled; the tool_result input reflects what OMP actually accepted.
      const exposedWriters = extractTaskItems(event.input)
        .filter(item => {
          const role = roleForAgent(typeof item.agent === "string" ? item.agent : "");
          return (role === "builder" || role === "synthesizer") && item.isolated !== true;
        })
        .map(item => String(item.agent));
      if (exposedWriters.length > 0 && (await store.get(ctx)).state.mode !== "off") {
        ctx.ui.notify(
          `pstack: ${exposedWriters.join(", ")} ran without OMP task isolation and may mutate the primary worktree. Enable task.isolation.enabled for isolated writers.`,
          "warning",
        );
        await store.checkpoint(ctx, "writer_not_isolated", { agents: exposedWriters });
      }
      if (actors.length > 0) {
        await store.checkpoint(ctx, "task_result", {
          actors,
          ingestedEvidence: ingestion.evidenceIds,
          ingestedVerdicts: ingestion.verdictIds,
          ingestionWarnings: ingestion.warnings,
          failed: event.isError === true,
          toolCallId: event.toolCallId,
          asyncState: isRecord(event.details) && isRecord(event.details.async) ? event.details.async.state : undefined,
        });
      }
    } catch (error) {
      api.logger.warn("pstack: failed to reconcile task result", { error: String(error) });
    }
    return undefined;
  });

  /**
   * OMP owns the goal lifecycle; pstack only refuses `goal op=complete` while
   * gates are open. A refused call leaves the goal active and OMP's goal
   * continuation re-prompts the model (see test/fixtures/omp-probe-18.2.11).
   */
  const gateGoalCompletion = async (ctx: ExtensionContext) => {
    await lifecycle.reconcile(ctx, store);
    const bucket = await store.get(ctx);
    const run = bucket.state.activeRun;
    if (bucket.state.mode === "off" || !run || run.status !== "active") return undefined;
    const current = await computeArtifactFingerprint(api, ctx.cwd, bucket.config);
    const report = evaluateCompletionGates(bucket.state, current, bucket.config, { ignoreRunStatus: true });
    if (report.allowed) return undefined;
    await store.mutate(ctx, { type: "increment_stop_gate", at: nowIso() }, "goal_complete_blocked");
    return {
      block: true,
      reason: [
        "pstack refused goal completion: required proof gates remain open.",
        renderGateReport(report),
        "Keep working toward the goal until the gates pass, then call goal op=complete again.",
      ].join("\n\n"),
    };
  };

  api.on("goal_updated", async (event: GoalUpdatedEvent, ctx: ExtensionContext) => {
    if (!isMainSession(ctx)) return;
    const goal = goalFromValue(event.goal);
    if (!goal) return;
    const bucket = await store.get(ctx);
    const run = bucket.state.activeRun;
    if (bucket.state.mode === "off" || !run || run.status !== "active") return;
    const at = nowIso();
    if (!run.goalRef) {
      if (goal.status === "active") await store.mutate(ctx, { type: "bind_goal", goalRef: goal.id, at }, "goal_bound");
      return;
    }
    if (run.goalRef !== goal.id) return;
    if (goal.status === "complete") {
      await store.mutate(ctx, { type: "mark_run_done", at }, "goal_completed");
    } else if (goal.status === "dropped") {
      await store.mutate(ctx, { type: "mark_run_failed", reason: "OMP goal was dropped by the user.", at }, "goal_dropped");
    }
  });

  api.on("session_stop", async (_event: unknown, ctx: ExtensionContext) => {
    const headlessDeadlineAt = isHeadless(ctx)
      ? Date.now() + HEADLESS_SHUTDOWN_BASELINE_TIMEOUT_MS
      : undefined;
    if (headlessDeadlineAt === undefined) {
      await lifecycle.reconcile(ctx, store);
    } else {
      await withDeadline(
        () => lifecycle.reconcile(ctx, store),
        Math.max(1, headlessDeadlineAt - Date.now()),
      );
    }
    const baselineReady = await ensureBaseline(ctx, headlessDeadlineAt);
    const key = sessionKey(ctx);
    if (!baselineReady) abandonPendingBaseline(key);
    if (!(await waitForBaseline(key, headlessDeadlineAt))) abandonPendingBaseline(key);
    const bucket = await getStore(ctx, headlessDeadlineAt);
    if (!bucket) return undefined;
    if (bucket.state.mode === "off") return undefined;
    const run = bucket.state.activeRun;
    if (!run || run.status !== "active") {
      const token = currentBaselineToken(key);
      const finding = await findUnengagedChange(
        ctx,
        headlessDeadlineAt === undefined ? FINDING_SCAN_TIMEOUT_MS : HEADLESS_FINDING_TIMEOUT_MS,
      );
      if (!finding || !token || !isCurrentBaseline(key, token)) return undefined;
      const latestBucket = await store.get(ctx);
      if (
        latestBucket.state.mode === "off"
        || latestBucket.state.activeRun?.status === "active"
        || engagedSince(latestBucket.state, token.baseline.at)
      ) return undefined;
      const blocked = tripwireBlocks.get(key) ?? 0;
      if (latestBucket.state.mode === "strict" && blocked < stopGateBudget(latestBucket.config, latestBucket.state.mode)) {
        tripwireBlocks.set(key, blocked + 1);
        const audit = appendSessionAudit(ctx.cwd, latestBucket.config, "unengaged_stop_blocked", { ...finding, attempt: blocked + 1 });
        if (headlessDeadlineAt === undefined) await audit;
        else await withDeadline(() => audit, HEADLESS_AUDIT_TIMEOUT_MS);
        const afterAudit = await store.get(ctx);
        if (
          !isCurrentBaseline(key, token)
          || afterAudit.state.mode === "off"
          || afterAudit.state.activeRun?.status === "active"
          || engagedSince(afterAudit.state, token.baseline.at)
        ) return undefined;
        return { decision: "block", reason: renderEngagementFinding(finding, false) };
      }
      if (isHeadless(ctx)) return undefined;
      await recordUnengagedChange(ctx, finding, false, undefined, token);
      const afterRecord = await store.get(ctx);
      if (
        !isCurrentBaseline(key, token)
        || afterRecord.state.mode === "off"
        || afterRecord.state.activeRun?.status === "active"
        || engagedSince(afterRecord.state, token.baseline.at)
      ) return undefined;
      ctx.ui.notify(renderEngagementFinding(finding, false), "warning");
      return undefined;
    }
    // While the bound goal is live, OMP's goal continuation owns "keep working"
    // and goal op=complete is the gate; blocking the stop too makes the model
    // spin (observed live: 18 blocked stops in ~50s). Without a live goal the
    // run is an auto/strict gate-only run and session_stop is its gate.
    const goal = run.goalRef ? currentGoal(ctx) : undefined;
    if (goal && goal.id === run.goalRef) return undefined;
    const current = headlessDeadlineAt === undefined
      ? await computeArtifactFingerprint(api, ctx.cwd, bucket.config)
      : await withDeadline(
        signal => computeArtifactFingerprint(api, ctx.cwd, bucket.config, signal),
        Math.max(1, headlessDeadlineAt - Date.now()),
      );
    const report = evaluateCompletionGates(bucket.state, current, bucket.config);
    if (report.allowed) return undefined;
    // Cannot finish: let the session end rather than burn turns. The run stays
    // active, so no gate is passed by stopping.
    if (run.stopGateAttempts >= stopGateBudget(bucket.config, bucket.state.mode)) {
      // Headless sessions report once at session_shutdown (stderr + exit status).
      if (!isHeadless(ctx)) {
        ctx.ui.notify(`pstack: session ended with open gates; run ${run.id} stays active.\n${renderGateReport(report)}`, "warning");
      }
      return undefined;
    }
    const gateMutation = store.mutate(ctx, { type: "increment_stop_gate", at: nowIso() }, "session_stop_blocked");
    if (headlessDeadlineAt === undefined) await gateMutation;
    else await withDeadline(() => gateMutation, Math.max(1, headlessDeadlineAt - Date.now()));
    return {
      decision: "block",
      reason: [
        "pstack blocked session completion because required engineering gates remain open.",
        renderGateReport(report),
        "Continue the work, or abandon the run with pstack_gate action=abandon and a reason. Do not claim completion until the gates pass.",
      ].join("\n\n"),
    };
  });
}
