import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { CeremonyLevel, Playbook } from "./domain.js";
import { computeArtifactFingerprint, type ExecRunner } from "./fingerprint.js";
import { evaluateCompletionGates, renderGateReport } from "./gates.js";
import { currentGoal } from "./goal.js";
import { classifyTask } from "./router.js";
import { createRun } from "./state.js";
import type { PstackStore } from "./store.js";
import { nowIso } from "./utils.js";

export interface GateInitInput {
  objective?: string;
  playbook?: Playbook;
  ceremony?: CeremonyLevel;
  verificationRequired?: boolean;
  acceptance?: Array<{ id?: string; text: string; required?: boolean }>;
}

export interface GateControlOutcome {
  ok: boolean;
  text: string;
  details?: unknown;
}

/**
 * Opens the proof state for one objective. OMP owns the lifecycle: with an
 * active goal the run gates `goal op=complete`; without goal mode the run is
 * gate-only, must start in auto or strict, and closes through {@link checkGate}.
 * Explicit acceptance criteria win; the goal objective is context only and never becomes a criterion.
 */
export async function initGate(
  exec: ExecRunner,
  store: PstackStore,
  ctx: ExtensionContext,
  input: GateInitInput,
): Promise<GateControlOutcome> {
  const bucket = await store.get(ctx);
  if (bucket.state.mode === "off") {
    return {
      ok: false,
      text: "Pstack is off for this session. Enable it with /pstack auto, /pstack strict, or --pstack-mode before opening a run.",
    };
  }
  const existing = bucket.state.activeRun;
  if (existing && existing.status === "active") {
    return { ok: false, text: `Run ${existing.id} is still active; check or abandon it first.` };
  }
  const goal = currentGoal(ctx);
  const boundGoal = goal?.status === "active" ? goal : undefined;
  const objective = input.objective?.trim() || boundGoal?.objective.trim() || "";
  if (!objective) return { ok: false, text: "objective is required when no OMP goal is active." };

  const at = nowIso();
  const routed = classifyTask(objective);
  const run = createRun({
    objective,
    playbook: input.playbook ?? routed.playbook,
    ceremony: input.ceremony ?? routed.ceremony,
    verificationRequired: input.verificationRequired ?? routed.verificationRequired,
    ...(input.acceptance !== undefined ? { acceptance: input.acceptance } : {}),
    at,
  });
  const fingerprint = await computeArtifactFingerprint(exec, ctx.cwd, bucket.config);
  run.baselineFingerprint = fingerprint;
  run.lastKnownFingerprint = fingerprint;
  if (boundGoal) run.goalRef = boundGoal.id;
  await store.mutate(ctx, { type: "start_run", run, at });
  return {
    ok: true,
    text: [
      `Started ${run.id}: ${run.playbook}/${run.ceremony}; baseline ${fingerprint.digest}.`,
      run.goalRef
        ? `Gates OMP goal ${run.goalRef}: goal op=complete is refused until all gates pass.`
        : "Gate-only mode (auto/strict; no active OMP goal): close it with pstack_gate action=check once gates pass.",
      ...(input.playbook === undefined && !routed.grounded
        ? [`Playbook defaulted to ${run.playbook}: the objective carried no routing signal. If another skill://pstack row fits, abandon this run and re-init with an explicit playbook.`]
        : []),
      ...(run.acceptance.length === 0 ? ["No acceptance criteria yet: add them with pstack_acceptance."] : []),
    ].join("\n"),
    details: run,
  };
}

export async function checkGate(exec: ExecRunner, store: PstackStore, ctx: ExtensionContext): Promise<GateControlOutcome> {
  const bucket = await store.get(ctx);
  const run = bucket.state.activeRun;
  if (!run || run.status !== "active") return { ok: false, text: "No active pstack run. Open one with pstack_gate action=init." };
  const current = await computeArtifactFingerprint(exec, ctx.cwd, bucket.config);
  const report = evaluateCompletionGates(bucket.state, current, bucket.config, { ignoreRunStatus: true });
  if (!report.allowed) return { ok: false, text: renderGateReport(report), details: report };
  if (run.goalRef && currentGoal(ctx)?.id === run.goalRef) {
    return { ok: true, text: `All gates pass. Finish with goal op=complete (goal ${run.goalRef}).`, details: report };
  }
  const updated = await store.mutate(ctx, { type: "mark_run_done", at: nowIso() }, "gate_closed");
  return { ok: true, text: "Pstack run closed; all gates passed.", details: updated.state.activeRun };
}

export async function abandonGate(store: PstackStore, ctx: ExtensionContext, reason: string | undefined): Promise<GateControlOutcome> {
  if (!reason?.trim()) return { ok: false, text: "reason is required to abandon a run." };
  const run = (await store.get(ctx)).state.activeRun;
  if (!run || run.status !== "active") return { ok: false, text: "No active pstack run." };
  const updated = await store.mutate(ctx, { type: "mark_run_failed", reason: reason.trim(), at: nowIso() }, "gate_abandoned");
  return { ok: true, text: `Run ${run.id} abandoned: ${reason.trim()}`, details: updated.state.activeRun };
}
