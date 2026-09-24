import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { AgentRecord, AgentStatus } from "./domain.js";
import type { PstackStore } from "./store.js";
import { createId, isRecord, nowIso } from "./utils.js";

export interface ExpectedTaskSpawn {
  agentName: string;
  actorId?: string;
  runtimeAgentId?: string;
}

export interface PendingTaskCall {
  sessionKey: string;
  toolCallId: string;
  expected: ExpectedTaskSpawn[];
  createdAt: string;
  asyncState?: string;
  primaryJobId?: string;
}

interface TaskProgressLike {
  id?: string;
  agent?: string;
  status?: string;
  jobId?: string;
  exitCode?: number;
}

interface AsyncDetailsLike {
  state?: string;
  jobId?: string;
}

export interface TaskResultLike {
  toolCallId?: string;
  isError?: boolean;
  details?: unknown;
}

export interface SpawnAssignment {
  toolCallId?: string;
  actorId: string;
}

const TERMINAL = new Set<AgentStatus>(["completed", "failed", "cancelled"]);

function normalizeAgentName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

export function extractTaskItems(input: unknown): Record<string, unknown>[] {
  if (!isRecord(input)) return [];
  if (Array.isArray(input.tasks)) return input.tasks.filter(isRecord);
  if (isRecord(input.task)) return [input.task];
  if (typeof input.agent === "string") return [input];
  return [];
}

export function expectedTaskSpawns(input: unknown): ExpectedTaskSpawn[] {
  return extractTaskItems(input)
    .map(item => normalizeAgentName(item.agent))
    .filter((agentName): agentName is string => Boolean(agentName))
    .map(agentName => ({ agentName }));
}

function normalizeStatus(value: unknown, exitCode?: number): AgentStatus | undefined {
  if (typeof value === "string") {
    const status = value.trim().toLowerCase();
    if (["completed", "complete", "succeeded", "success", "done", "passed"].includes(status)) return "completed";
    if (["failed", "failure", "error", "errored"].includes(status)) return "failed";
    if (["cancelled", "canceled", "aborted", "killed"].includes(status)) return "cancelled";
    if (["running", "active", "in_progress", "in-progress", "started", "starting", "queued", "pending"].includes(status)) {
      return "running";
    }
  }
  if (typeof exitCode === "number") return exitCode === 0 ? "completed" : "failed";
  return undefined;
}

function progressRows(details: unknown): TaskProgressLike[] {
  if (!isRecord(details)) return [];
  const rows: TaskProgressLike[] = [];
  for (const key of ["progress", "results"] as const) {
    const value = details[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!isRecord(item)) continue;
      rows.push({
        ...(typeof item.id === "string" ? { id: item.id } : {}),
        ...(typeof item.agent === "string" ? { agent: item.agent } : {}),
        ...(typeof item.status === "string" ? { status: item.status } : {}),
        ...(typeof item.jobId === "string" ? { jobId: item.jobId } : {}),
        ...(typeof item.exitCode === "number" ? { exitCode: item.exitCode } : {}),
      });
    }
  }
  return rows;
}

function asyncDetails(details: unknown): AsyncDetailsLike | undefined {
  if (!isRecord(details) || !isRecord(details.async)) return undefined;
  return {
    ...(typeof details.async.state === "string" ? { state: details.async.state } : {}),
    ...(typeof details.async.jobId === "string" ? { jobId: details.async.jobId } : {}),
  };
}

function terminal(status: AgentStatus): boolean {
  return TERMINAL.has(status);
}

interface JobRow {
  id?: string;
  /** Delivery rows only: when the notice was written; must not predate the actor's spawn. */
  deliveredAt?: string;
  agentId?: string;
  status?: string;
  type?: string;
  source?: "snapshot" | "delivery";
}

/** OMP's `customType` for injected background-job completion notices (session/async-job-delivery.ts). */
const ASYNC_RESULT_MESSAGE_TYPE = "async-result";

function deliveredAtOf(value: unknown): string | undefined {
  const ms = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/**
 * Terminal rows from delivered `async-result` notices on the current branch.
 * A notice is only written after the job settled; a schema-invalid structured
 * payload is a failed worker contract, anything else a completed job.
 */
function deliveredResultRows(ctx: ExtensionContext): JobRow[] {
  let entries: unknown[];
  try {
    entries = ctx.sessionManager.getBranch() as unknown[];
  } catch {
    return [];
  }
  const rows: JobRow[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || entry.type !== "custom_message" || entry.customType !== ASYNC_RESULT_MESSAGE_TYPE) continue;
    const details = entry.details;
    if (!isRecord(details) || !Array.isArray(details.jobs)) continue;
    for (const job of details.jobs) {
      if (!isRecord(job) || typeof job.jobId !== "string" || !job.jobId.trim()) continue;
      const schemaStatus = isRecord(job.schema) && typeof job.schema.status === "string" ? job.schema.status : undefined;
      rows.push({
        id: job.jobId.trim(),
        ...(deliveredAtOf(entry.timestamp) ? { deliveredAt: deliveredAtOf(entry.timestamp) as string } : {}),
        status: schemaStatus === "invalid" ? "failed" : "completed",
        ...(typeof job.type === "string" ? { type: job.type } : {}),
        source: "delivery",
      });
    }
  }
  return rows;
}

/**
 * Last-resort match for an actor that never learned its job or runtime id
 * (its task result was a skipped `wait`): OMP names a task job after the task
 * item, which is also the spawn key. Only used when the key is unambiguous.
 */
function rowBySpawnKey(actor: AgentRecord, openActors: AgentRecord[], rows: JobRow[]): JobRow | undefined {
  const key = actor.spawnKey?.trim();
  if (!key) return undefined;
  if (openActors.filter(other => other.spawnKey?.trim() === key).length !== 1) return undefined;
  return rows.find(item => item.id === key || item.agentId === key);
}

function snapshotRows(snapshot: unknown): JobRow[] {
  if (!isRecord(snapshot)) return [];
  const rows: JobRow[] = [];
  for (const key of ["running", "recent"] as const) {
    const value = snapshot[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!isRecord(item)) continue;
      rows.push({
        ...(typeof item.id === "string" ? { id: item.id } : {}),
        ...(typeof item.agentId === "string" ? { agentId: item.agentId } : {}),
        ...(typeof item.status === "string" ? { status: item.status } : {}),
        ...(typeof item.type === "string" ? { type: item.type } : {}),
        source: "snapshot",
      });
    }
  }
  return rows;
}

export interface TaskResultSummary {
  id: string;
  agentName?: string;
  status: string;
}

export function parseTaskResultSummaries(text: string): TaskResultSummary[] {
  const rows: TaskResultSummary[] = [];
  const tagPattern = /<task-result\b([^>]*)>/g;
  for (const match of text.matchAll(tagPattern)) {
    const attributes: Record<string, string> = {};
    for (const attribute of (match[1] ?? "").matchAll(/([A-Za-z][\w-]*)="([^"]*)"/g)) {
      const key = attribute[1];
      const value = attribute[2];
      if (!key || value === undefined) continue;
      attributes[key] = value;
    }
    const id = attributes.id?.trim();
    const status = attributes.status?.trim();
    if (!id || !status) continue;
    rows.push({
      id,
      ...(attributes.agent?.trim() ? { agentName: attributes.agent.trim() } : {}),
      status,
    });
  }
  return rows;
}

/**
 * Correlates task tool calls, before_subagent_spawn hooks, task results, and the
 * async job registry. OMP's spawn hook does not currently carry toolCallId, so
 * matching is deterministic best-effort by expected agent occurrence. Runtime
 * agent IDs from task result progress become the durable reconciliation key.
 */
export class TaskLifecycleTracker {
  private readonly callsBySession = new Map<string, Map<string, PendingTaskCall>>();

  beginCall(sessionKey: string, toolCallId: string | undefined, input: unknown): PendingTaskCall {
    const id = toolCallId?.trim() || createId("task-call");
    const call: PendingTaskCall = {
      sessionKey,
      toolCallId: id,
      expected: expectedTaskSpawns(input),
      createdAt: nowIso(),
    };
    const calls = this.callsBySession.get(sessionKey) ?? new Map<string, PendingTaskCall>();
    calls.set(id, call);
    this.callsBySession.set(sessionKey, calls);
    return call;
  }

  assignSpawn(sessionKey: string, agentName: string, preferredActorId?: string): SpawnAssignment {
    const normalized = normalizeAgentName(agentName) ?? agentName;
    const calls = [...(this.callsBySession.get(sessionKey)?.values() ?? [])]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    for (const call of calls) {
      const slot = call.expected.find(item => item.agentName === normalized && !item.actorId);
      if (!slot) continue;
      const actorId = preferredActorId?.trim() || createId(`${normalized}-actor`);
      slot.actorId = actorId;
      return { toolCallId: call.toolCallId, actorId };
    }
    return { actorId: preferredActorId?.trim() || createId(`${normalized}-actor`) };
  }

  dropSession(sessionKey: string): void {
    this.callsBySession.delete(sessionKey);
  }

  private call(sessionKey: string, toolCallId: string | undefined): PendingTaskCall | undefined {
    const calls = this.callsBySession.get(sessionKey);
    if (!calls) return undefined;
    if (toolCallId && calls.has(toolCallId)) return calls.get(toolCallId);
    if (calls.size === 1) return calls.values().next().value as PendingTaskCall | undefined;
    return undefined;
  }

  async applyTaskResult(
    sessionKey: string,
    event: TaskResultLike,
    ctx: ExtensionContext,
    store: PstackStore,
  ): Promise<string[]> {
    const call = this.call(sessionKey, event.toolCallId);
    if (!call) return [];
    const at = nowIso();
    const rows = progressRows(event.details);
    const asyncInfo = asyncDetails(event.details);
    if (asyncInfo?.state) call.asyncState = asyncInfo.state;
    else delete call.asyncState;
    if (asyncInfo?.jobId) call.primaryJobId = asyncInfo.jobId;
    else delete call.primaryJobId;
    const touched: string[] = [];
    const used = new Set<number>();

    for (const slot of call.expected) {
      if (!slot.actorId) continue;
      let rowIndex = rows.findIndex((row, index) => {
        if (used.has(index)) return false;
        const rowAgent = normalizeAgentName(row.agent);
        return rowAgent === slot.agentName;
      });
      if (rowIndex < 0 && call.expected.length === 1 && rows.length === 1) rowIndex = 0;
      const row = rowIndex >= 0 ? rows[rowIndex] : undefined;
      if (rowIndex >= 0) used.add(rowIndex);
      const observed = normalizeStatus(row?.status, row?.exitCode);
      const asyncState = normalizeStatus(asyncInfo?.state);
      let status: AgentStatus;
      if (event.isError === true) status = "failed";
      else if (observed) status = observed;
      else if (asyncState === "running") status = "running";
      else if (asyncState && terminal(asyncState)) status = asyncState;
      else if (!asyncInfo) status = "completed";
      else status = "running";

      const runtimeAgentId = row?.id?.trim();
      if (runtimeAgentId) slot.runtimeAgentId = runtimeAgentId;
      await store.mutate(ctx, {
        type: "update_agent",
        actorId: slot.actorId,
        patch: {
          status,
          toolCallId: call.toolCallId,
          ...(runtimeAgentId ? { runtimeAgentId } : {}),
          ...(row?.jobId ? { jobId: row.jobId } : call.expected.length === 1 && asyncInfo?.jobId ? { jobId: asyncInfo.jobId } : {}),
          lastSeenAt: at,
          ...(terminal(status) ? { completedAt: at } : {}),
          lifecycleNote: asyncInfo?.state
            ? `task result async.state=${asyncInfo.state}`
            : "task result reached terminal tool_result",
        },
        at,
      }, "subagent_task_result");
      touched.push(slot.actorId);
    }

    if (call.expected.every(slot => !slot.actorId || touched.includes(slot.actorId)) && (!asyncInfo || normalizeStatus(asyncInfo.state) !== "running")) {
      this.callsBySession.get(sessionKey)?.delete(call.toolCallId);
    }
    return touched;
  }

  async reconcile(ctx: ExtensionContext, store: PstackStore): Promise<string[]> {
    const bucket = await store.get(ctx);
    const run = bucket.state.activeRun;
    if (!run) return [];
    let snapshot: unknown;
    try {
      snapshot = ctx.getAsyncJobSnapshot();
    } catch {
      return [];
    }
    // The snapshot's `recent` list is capped, and a completion OMP already
    // delivered as an `async-result` notice (for example when `wait` was
    // skipped because the notice was queued) may never reach a task or wait
    // tool_result. Delivered notices are durable branch entries, so read them too.
    // Delivered notices are terminal by construction, so they win over a stale
    // `running` snapshot row for the same job.
    const allRows = [...deliveredResultRows(ctx), ...snapshotRows(snapshot)];
    if (allRows.length === 0) return [];
    const touched: string[] = [];
    const at = nowIso();
    const openTaskActors = run.agents.filter(actor => actor.invocationKind === "task" && !terminal(actor.status));
    for (const actor of openTaskActors) {
      // A job id can be reused by a later task item; ignore notices older than this actor.
      const spawnedMs = Date.parse(actor.spawnedAt);
      const rows = allRows.filter(item => !item.deliveredAt || !Number.isFinite(spawnedMs) || Date.parse(item.deliveredAt) >= spawnedMs);
      const row = rows.find(item =>
        (actor.runtimeAgentId && item.agentId === actor.runtimeAgentId)
        || (actor.jobId && item.id === actor.jobId),
      ) ?? (actor.jobId || actor.runtimeAgentId ? undefined : rowBySpawnKey(actor, openTaskActors, rows));
      if (!row) continue;
      const status = normalizeStatus(row.status) ?? (row.type === "running" ? "running" : undefined);
      if (!status || status === actor.status) continue;
      await store.mutate(ctx, {
        type: "update_agent",
        actorId: actor.actorId,
        patch: {
          status,
          ...(row.id ? { jobId: row.id } : {}),
          lastSeenAt: at,
          ...(terminal(status) ? { completedAt: at } : {}),
          lifecycleNote: `reconciled from ${row.source === "delivery" ? "async-result delivery" : "async job snapshot"} (${row.status ?? row.type ?? "unknown"})`,
        },
        at,
      }, "subagent_job_reconcile");
      touched.push(actor.actorId);
    }
    return touched;
  }
  async reconcileTaskResultText(
    text: string,
    ctx: ExtensionContext,
    store: PstackStore,
  ): Promise<string[]> {
    const summaries = parseTaskResultSummaries(text);
    if (summaries.length === 0) return [];
    const bucket = await store.get(ctx);
    const run = bucket.state.activeRun;
    if (!run) return [];
    const pending = run.agents.filter(actor => actor.invocationKind === "task" && !terminal(actor.status));
    const touched: string[] = [];
    const used = new Set<string>();
    const at = nowIso();

    for (const summary of summaries) {
      const normalizedId = summary.id.trim();
      const normalizedAgent = normalizeAgentName(summary.agentName);
      const status = normalizeStatus(summary.status);
      if (!normalizedId || !status) continue;
      const byId = pending.find(actor =>
        !used.has(actor.actorId)
        && [actor.actorId, actor.runtimeAgentId, actor.jobId].some(value => value === normalizedId),
      );
      const actor = byId
        ?? pending.find(candidate =>
          !used.has(candidate.actorId)
          && normalizedAgent !== undefined
          && normalizeAgentName(candidate.agentName) === normalizedAgent,
        );
      if (!actor) continue;
      used.add(actor.actorId);
      if (status === actor.status) continue;
      await store.mutate(ctx, {
        type: "update_agent",
        actorId: actor.actorId,
        patch: {
          status,
          ...(actor.runtimeAgentId ? {} : { runtimeAgentId: normalizedId }),
          lastSeenAt: at,
          ...(terminal(status) ? { completedAt: at } : {}),
          lifecycleNote: `reconciled from task-result marker (${summary.status})`,
        },
        at,
      }, "subagent_task_result_marker");
      touched.push(actor.actorId);
    }
    return touched;
  }

}

export function pendingTaskAgents(agents: AgentRecord[]): AgentRecord[] {
  return agents.filter(agent => agent.invocationKind === "task" && !terminal(agent.status));
}
