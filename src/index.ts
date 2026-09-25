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
import { enforcePstackChildToolPolicy } from "./child-policy.js";
import { registerCommands, parseModeFlag } from "./commands.js";
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
import { stopGateBudget } from "./domain.js";
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


function sessionKey(ctx: ExtensionContext): string {
  try {
    return ctx.sessionManager.getSessionId();
  } catch {
    return `cwd:${ctx.cwd}`;
  }
}

/** OMP tools that write files directly. `bash` writes are caught by the stop/shutdown diff instead. */
const WRITE_TOOLS = new Set(["edit", "write", "ast_edit"]);

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
  registerCommands(api, store, reconcile);

  const hydrate = async (_event: unknown, ctx: ExtensionContext): Promise<void> => {
    if (!isMainSession(ctx)) return;
    const bucket = await store.hydrate(ctx);
    const flagged = parseModeFlag(api.getFlag("pstack-mode"));
    if (flagged && bucket.state.mode !== flagged) {
      await store.mutate(ctx, { type: "set_mode", mode: flagged, at: nowIso() }, "mode_from_cli_flag");
    }
  };

  // Engagement tripwire state, per main session and process: the working-tree
  // snapshot taken at start, whether the latest user prompt routed direct, and
  // how many stops the tripwire has blocked.
  const baselines = new Map<string, ChangeBaseline>();
  const routedDirect = new Map<string, boolean>();
  const tripwireBlocks = new Map<string, number>();

  const captureBaseline = async (ctx: ExtensionContext): Promise<void> => {
    if (!isMainSession(ctx) || baselines.has(sessionKey(ctx))) return;
    const bucket = await store.get(ctx);
    if (!bucket.config.engagementTripwire) return;
    const tree = await snapshotWorkingTree(api, ctx.cwd, bucket.config);
    if (tree) baselines.set(sessionKey(ctx), { tree, at: nowIso() });
  };

  const findUnengagedChange = async (ctx: ExtensionContext): Promise<EngagementFinding | undefined> => {
    const baseline = baselines.get(sessionKey(ctx));
    const bucket = await store.get(ctx);
    if (!baseline || !bucket.config.engagementTripwire || bucket.state.mode === "off") return undefined;
    if (engagedSince(bucket.state, baseline.at)) return undefined;
    const now = await snapshotWorkingTree(api, ctx.cwd, bucket.config);
    if (!now) return undefined;
    const stat = await diffTrees(api, ctx.cwd, baseline.tree, now);
    if (!stat || !exceedsDirectBudget(stat, bucket.config)) return undefined;
    return { stat, budget: { files: bucket.config.directMaxFiles, lines: bucket.config.directMaxLines } };
  };

  api.on("session_start", async (event: unknown, ctx: ExtensionContext) => {
    await hydrate(event, ctx);
    try {
      await captureBaseline(ctx);
    } catch (error) {
      api.logger.warn("pstack: engagement baseline failed", { error: String(error) });
    }
  });
  api.on("session_switch", hydrate);
  api.on("session_branch", hydrate);
  api.on("session_tree", hydrate);
  const reportHeadlessOpenRun = async (ctx: ExtensionContext): Promise<void> => {
    if (!isMainSession(ctx) || !isHeadless(ctx)) return;
    // Background completions can arrive as notices rather than task/wait
    // results; settle them from OMP's job snapshot before judging the run.
    await lifecycle.reconcile(ctx, store);
    const bucket = await store.get(ctx);
    const run = bucket.state.activeRun;
    if (bucket.state.mode === "off") return;
    if (!run || run.status !== "active") {
      const finding = await findUnengagedChange(ctx);
      if (!finding) return;
      const exitCode = bucket.config.headlessOpenGateExitCode;
      writeStderr([
        renderEngagementFinding(finding, true),
        exitCode > 0
          ? `Exit status ${exitCode} signals unverified work (set engagementTripwire to false or raise directMaxFiles/directMaxLines to change this).`
          : "Exit status unchanged (headlessOpenGateExitCode is 0).",
      ].join("\n"));
      await appendSessionAudit(ctx.cwd, bucket.config, "unengaged_change", { ...finding, exitCode, headless: true });
      signalOpenGatesOnExit(exitCode);
      return;
    }
    const current = await computeArtifactFingerprint(api, ctx.cwd, bucket.config);
    const report = evaluateCompletionGates(bucket.state, current, bucket.config, { ignoreRunStatus: true });
    // Gates that pass but were never closed are reported, not failed: the work
    // may be done; only the bookkeeping is missing.
    const exitCode = report.allowed ? 0 : bucket.config.headlessOpenGateExitCode;
    writeStderr(renderHeadlessOpenGates(run, report, exitCode));
    await store.checkpoint(ctx, "headless_open_gates", {
      runId: run.id,
      exitCode,
      issues: report.issues.map(item => item.code),
    });
    signalOpenGatesOnExit(exitCode);
  };

  api.on("session_shutdown", async (_event: unknown, ctx: ExtensionContext) => {
    try {
      await reportHeadlessOpenRun(ctx);
    } catch (error) {
      api.logger.warn("pstack: headless open-gate report failed", { error: String(error) });
    } finally {
      lifecycle.dropSession(sessionKey(ctx));
      baselines.delete(sessionKey(ctx));
      routedDirect.delete(sessionKey(ctx));
      tripwireBlocks.delete(sessionKey(ctx));
      store.clearSession(ctx);
    }
  });

  api.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext): Promise<BeforeAgentStartEventResult | undefined> => {
    if (!isMainSession(ctx)) return undefined;
    await lifecycle.reconcile(ctx, store);
    const bucket = await store.get(ctx);
    if (bucket.state.mode === "off") return undefined;
    const routing = classifyTask(event.prompt || bucket.state.activeRun?.objective || "continue active engineering work");
    if (event.prompt) routedDirect.set(sessionKey(ctx), routing.ceremony === "direct");
    const segment = buildPolicySegment(bucket.state, routing, bucket.config);
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
    if (WRITE_TOOLS.has(toolNameOf(event)) && isMainSession(ctx)) {
      const bucket = await store.get(ctx);
      if (bucket.state.mode === "strict" && bucket.config.engagementTripwire && !bucket.state.activeRun && routedDirect.get(sessionKey(ctx)) !== true) {
        await appendSessionAudit(ctx.cwd, bucket.config, "unengaged_write_blocked", { tool: toolNameOf(event) });
        return {
          block: true,
          reason: "pstack strict mode: open a run before editing. Call pstack_gate action=init with the playbook you chose from skill://pstack and acceptance criteria, then make the change.",
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
    await lifecycle.reconcile(ctx, store);
    const bucket = await store.get(ctx);
    const run = bucket.state.activeRun;
    if (bucket.state.mode === "off") return undefined;
    if (!run || run.status !== "active") {
      const finding = await findUnengagedChange(ctx);
      if (!finding) return undefined;
      const key = sessionKey(ctx);
      const blocked = tripwireBlocks.get(key) ?? 0;
      if (bucket.state.mode === "strict" && blocked < stopGateBudget(bucket.config, bucket.state.mode)) {
        tripwireBlocks.set(key, blocked + 1);
        await appendSessionAudit(ctx.cwd, bucket.config, "unengaged_stop_blocked", { ...finding, attempt: blocked + 1 });
        return { decision: "block", reason: renderEngagementFinding(finding, false) };
      }
      // Headless sessions report once at session_shutdown (stderr + exit status).
      if (!isHeadless(ctx)) ctx.ui.notify(renderEngagementFinding(finding, false), "warning");
      return undefined;
    }
    // While the bound goal is live, OMP's goal continuation owns "keep working"
    // and goal op=complete is the gate; blocking the stop too makes the model
    // spin (observed live: 18 blocked stops in ~50s). Without a live goal the
    // run is an auto/strict gate-only run and session_stop is its gate.
    const goal = run.goalRef ? currentGoal(ctx) : undefined;
    if (goal && goal.id === run.goalRef) return undefined;
    const current = await computeArtifactFingerprint(api, ctx.cwd, bucket.config);
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
    await store.mutate(ctx, { type: "increment_stop_gate", at: nowIso() }, "session_stop_blocked");
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
