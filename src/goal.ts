import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { isRecord } from "./utils.js";

const GOAL_STATUSES = ["active", "paused", "budget-limited", "complete", "dropped"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** The subset of OMP's `Goal` that pstack binds a run to. `id` is stable across updates and resume. */
export interface GoalSnapshot {
  id: string;
  objective: string;
  status: GoalStatus;
}

export function goalFromValue(value: unknown): GoalSnapshot | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return undefined;
  const status = (GOAL_STATUSES as readonly unknown[]).includes(value.status) ? (value.status as GoalStatus) : undefined;
  if (!status) return undefined;
  return { id: value.id, objective: typeof value.objective === "string" ? value.objective : "", status };
}

/**
 * OMP persists goal mode on the branch as `mode_change` entries
 * (`mode: "goal" | "goal_paused"`, `data.goal`); leaving goal mode appends a
 * `mode_change` with another mode. The latest `mode_change` is authoritative
 * (see test/fixtures/omp-probe-18.2.11).
 */
export function currentGoal(ctx: ExtensionContext): GoalSnapshot | undefined {
  let entries: unknown[];
  try {
    entries = ctx.sessionManager.getBranch();
  } catch {
    return undefined;
  }
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!isRecord(entry) || entry.type !== "mode_change") continue;
    if (entry.mode !== "goal" && entry.mode !== "goal_paused") return undefined;
    return isRecord(entry.data) ? goalFromValue(entry.data.goal) : undefined;
  }
  return undefined;
}
