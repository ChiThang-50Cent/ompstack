import type { ExtensionContext, SessionEntry } from "@oh-my-pi/pi-coding-agent";
import { isRecord } from "./utils.js";

export type SessionKind =
  | { kind: "main" }
  | { kind: "subagent"; agentName?: string }
  | { kind: "unknown" };

function entriesOf(ctx: ExtensionContext): SessionEntry[] | undefined {
  try {
    const entries = ctx.sessionManager.getEntries?.();
    if (Array.isArray(entries)) return entries;
  } catch {
    // Fall through to the active branch.
  }
  try {
    const branch = ctx.sessionManager.getBranch();
    return Array.isArray(branch) ? branch : undefined;
  } catch {
    return undefined;
  }
}

/**
 * OMP runs parent-loaded hooks inside child task sessions and appends the
 * child's `session_init` entry (task, agent, tools, readOnly, spawns, output
 * schema) before its first tool call (see test/fixtures/omp-probe-18.2.11).
 * A session whose entries cannot be read is `unknown`: it must not touch
 * parent gate state, and it is not assumed to be the main session.
 */
export function classifySession(ctx: ExtensionContext): SessionKind {
  const entries = entriesOf(ctx);
  if (!entries) return { kind: "unknown" };
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || entry.type !== "session_init" || !isRecord(entry)) continue;
    const agentName = typeof entry.agent === "string" ? entry.agent.trim().toLowerCase() : undefined;
    return { kind: "subagent", ...(agentName ? { agentName } : {}) };
  }
  return { kind: "main" };
}

export function isMainSession(ctx: ExtensionContext): boolean {
  return classifySession(ctx).kind === "main";
}
