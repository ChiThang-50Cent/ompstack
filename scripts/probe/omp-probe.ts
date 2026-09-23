// Compatibility probe for OMP host behavior that pstack depends on.
// Load with: omp -e scripts/probe/omp-probe.ts ...  (PROBE_LOG=<file.jsonl>)
// PROBE_BLOCK_GOAL_COMPLETE=1 makes the probe refuse `goal op=complete`.
import { appendFileSync } from "node:fs";

interface ProbeEntry { type?: unknown; customType?: unknown }
interface ProbeCtx {
  sessionManager?: {
    getBranch?(): ProbeEntry[];
    getSessionFile?(): string | undefined;
    getSessionId?(): string;
  };
}
interface ProbeToolEvent { toolName?: unknown; tool?: unknown; input?: unknown; isError?: unknown; details?: unknown; content?: unknown }
interface ProbeApi {
  on(event: string, handler: (event: ProbeToolEvent, ctx: ProbeCtx) => unknown): void;
  getActiveTools?(): string[];
  events?: { on?(channel: string, handler: (payload: unknown) => void): void };
}

const LOG = process.env.PROBE_LOG ?? "/tmp/omp-probe.jsonl";
const BLOCK_GOAL = process.env.PROBE_BLOCK_GOAL_COMPLETE === "1";

function safe(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "function") return "[fn]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(item => safe(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = typeof item === "string" && item.length > 1500 ? `${item.slice(0, 1500)}…` : safe(item, depth + 1);
  }
  return out;
}

function attempt<T>(fn: () => T): T | string {
  try { return fn(); } catch (error) { return `error:${String(error)}`; }
}

function sessionInfo(ctx: ProbeCtx) {
  const branch = attempt(() => ctx.sessionManager?.getBranch?.() ?? []);
  const entries = Array.isArray(branch) ? branch : [];
  return {
    sessionId: attempt(() => ctx.sessionManager?.getSessionId?.()),
    file: attempt(() => ctx.sessionManager?.getSessionFile?.()),
    entryTypes: Array.isArray(branch)
      ? entries.map(e => (e.customType ? `${String(e.type)}:${String(e.customType)}` : String(e.type)))
      : [branch],
    sessionInit: safe(entries.find(e => e.type === "session_init")),
    goalEntries: safe(entries.filter(e => /goal|mode/i.test(`${String(e.type)} ${String(e.customType ?? "")}`))),
  };
}

function log(kind: string, data: Record<string, unknown>) {
  appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, kind, ...data })}\n`);
}

export default function probe(api: ProbeApi): void {
  log("load", {
    apiKeys: Object.keys(api).sort(),
    apiProtoKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(api) ?? {}).sort(),
    hasEvents: typeof api.events,
  });

  for (const name of ["session_start", "session_switch", "session_branch", "session_tree", "session_shutdown", "goal_updated", "session_stop", "agent_start"]) {
    api.on(name, (event, ctx) => {
      log(name, {
        event: safe(event),
        session: sessionInfo(ctx),
        ctxKeys: Object.keys(ctx ?? {}).sort(),
        ctxProtoKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(ctx ?? {}) ?? {}).sort(),
        activeTools: attempt(() => api.getActiveTools?.()),
      });
      return undefined;
    });
  }

  api.on("before_subagent_spawn", (event, ctx) => {
    log("before_subagent_spawn", { event: safe(event), session: sessionInfo(ctx) });
    return undefined;
  });

  api.on("tool_call", (event, ctx) => {
    const name = String(event.toolName ?? event.tool ?? "");
    log("tool_call", { toolName: name, input: safe(event.input), session: sessionInfo(ctx), activeTools: attempt(() => api.getActiveTools?.()) });
    const input = event.input;
    if (BLOCK_GOAL && name === "goal" && input && typeof input === "object" && "op" in input && input.op === "complete") {
      log("goal_complete_blocked", {});
      return { block: true, reason: "PROBE: goal completion refused by extension gate. Do not retry; reply DONE-BLOCKED." };
    }
    if (process.env.PROBE_INJECT_ISOLATED === "1" && name === "task" && input && typeof input === "object" && "tasks" in input && Array.isArray(input.tasks)) {
      const next = { ...input, tasks: input.tasks.map((item: unknown) => (item && typeof item === "object" ? { ...item, isolated: true } : item)) };
      log("isolated_injected", { input: safe(next) });
      return { input: next };
    }
    return undefined;
  });

  api.on("tool_result", (event, ctx) => {
    const name = String(event.toolName ?? event.tool ?? "");
    if (name === "task" || name === "goal") {
      log("tool_result", { toolName: name, isError: event.isError, input: safe(event.input), details: safe(event.details), content: safe(event.content), session: sessionInfo(ctx) });
    }
    return undefined;
  });

  const bus = api.events;
  if (bus?.on) {
    for (const channel of ["task:subagent:lifecycle", "task:subagent:progress"]) {
      try {
        bus.on(channel, payload => log(`bus:${channel}`, { payload: safe(payload) }));
      } catch (error) {
        log("bus_subscribe_error", { channel, error: String(error) });
      }
    }
  }
}
