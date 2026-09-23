import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { roleForAgent } from "./model-routing.js";
import { classifySession } from "./session-kind.js";

export interface ChildToolEvent {
  toolCallId?: string;
  toolName?: string;
  tool?: string;
  input?: unknown;
}

export interface ChildToolDecision {
  handled: boolean;
  result?: { block: true; reason: string };
}

function toolNameOf(event: ChildToolEvent): string {
  return String(event.toolName ?? event.tool ?? "").trim().toLowerCase();
}

/**
 * Child sessions re-run parent-loaded hooks. OMP enforces each agent's
 * frontmatter `tools` (a `write` outside the list is limited to xd:// devices),
 * but always adds `hub` to explicit tool lists. Pstack blocks only what OMP
 * does not: outbound collaboration that breaks bounded ownership, and calls
 * into parent-owned pstack_* state. Agent assets must not declare `task` or
 * `spawns` (see test/assets.test.mjs).
 */
export function enforcePstackChildToolPolicy(event: ChildToolEvent, ctx: ExtensionContext): ChildToolDecision {
  const session = classifySession(ctx);
  if (session.kind === "main") return { handled: false };
  const role = session.kind === "subagent" ? roleForAgent(session.agentName ?? "") : undefined;
  const tool = toolNameOf(event);
  if (!role && !tool.startsWith("pstack_")) return { handled: true };
  if (tool.startsWith("pstack_")) {
    return {
      handled: true,
      result: {
        block: true,
        reason: "Pstack child agents cannot call parent-state pstack_* tools; return schema-valid structured output instead.",
      },
    };
  }
  if (tool === "hub") {
    return {
      handled: true,
      result: {
        block: true,
        reason: `Pstack ${role} child agents may not use hub; coordination belongs to the parent coordinator.`,
      },
    };
  }
  return { handled: true };
}
