import {
  DEFAULT_CONFIG,
  PSTACK_STATE_VERSION,
  type AcceptanceCriterion,
  type PstackConfig,
  type PstackRun,
  type PstackSessionState,
  type PstackStateAction,
  type Playbook,
  type CeremonyLevel,
} from "./domain.js";
import { createId, nowIso, uniqueStrings } from "./utils.js";

export function createInitialState(config: PstackConfig = DEFAULT_CONFIG): PstackSessionState {
  return {
    version: PSTACK_STATE_VERSION,
    mode: config.defaultMode,
    updatedAt: nowIso(),
    completedRuns: [],
  };
}

export interface CreateRunInput {
  objective: string;
  playbook: Playbook;
  ceremony: CeremonyLevel;
  verificationRequired: boolean;
  acceptance?: Array<{ id?: string; text: string; required?: boolean }>;
  at?: string;
}

export function createRun(input: CreateRunInput): PstackRun {
  const at = input.at ?? nowIso();
  const acceptance: AcceptanceCriterion[] = (input.acceptance ?? []).map((item, index) => ({
    id: item.id?.trim() || `AC-${index + 1}`,
    text: item.text.trim(),
    required: item.required ?? true,
    state: "open",
    evidenceRefs: [],
    updatedAt: at,
  }));

  return {
    id: createId("run"),
    objective: input.objective.trim(),
    playbook: input.playbook,
    ceremony: input.ceremony,
    status: "active",
    verificationRequired: input.verificationRequired,
    createdAt: at,
    updatedAt: at,
    acceptance,
    evidence: [],
    decisions: [],
    agents: [],
    verdicts: [],
    stopGateAttempts: 0,
  };
}

function requireRun(state: PstackSessionState): PstackRun {
  if (!state.activeRun) throw new Error("No active pstack run.");
  return state.activeRun;
}

function cloneRun(run: PstackRun): PstackRun {
  return {
    ...run,
    acceptance: run.acceptance.map(item => ({ ...item, evidenceRefs: [...item.evidenceRefs] })),
    evidence: run.evidence.map(item => ({
      ...item,
      ...(item.metadata !== undefined ? { metadata: { ...item.metadata } } : {}),
    })),
    decisions: run.decisions.map(item => ({ ...item, evidenceRefs: [...item.evidenceRefs] })),
    agents: run.agents.map(item => ({ ...item, modelPatterns: [...item.modelPatterns] })),
    verdicts: run.verdicts.map(item => ({
      ...item,
      writerActorIds: [...item.writerActorIds],
      evidenceRefs: [...item.evidenceRefs],
      observations: [...item.observations],
      limitations: [...item.limitations],
      testedFingerprint: {
        ...item.testedFingerprint,
        notes: [...item.testedFingerprint.notes],
      },
    })),
    ...(run.baselineFingerprint !== undefined
      ? { baselineFingerprint: { ...run.baselineFingerprint, notes: [...run.baselineFingerprint.notes] } }
      : {}),
    ...(run.lastKnownFingerprint !== undefined
      ? { lastKnownFingerprint: { ...run.lastKnownFingerprint, notes: [...run.lastKnownFingerprint.notes] } }
      : {}),
  };
}

export function reduceState(state: PstackSessionState, action: PstackStateAction): PstackSessionState {
  const next: PstackSessionState = {
    ...state,
    updatedAt: action.at,
    completedRuns: state.completedRuns.map(item => ({ ...item })),
    ...(state.activeRun !== undefined ? { activeRun: cloneRun(state.activeRun) } : {}),
  };

  switch (action.type) {
    case "set_mode":
      next.mode = action.mode;
      return next;
    case "start_run":
      if (next.activeRun && !["done", "failed"].includes(next.activeRun.status)) {
        throw new Error(`Run ${next.activeRun.id} is still active. Check or abandon it first.`);
      }
      next.activeRun = cloneRun(action.run);
      return next;
    case "mark_run_done": {
      const run = requireRun(next);
      run.status = "done";
      run.completedAt = action.at;
      run.updatedAt = action.at;
      next.completedRuns.push({
        id: run.id,
        objective: run.objective,
        playbook: run.playbook,
        ceremony: run.ceremony,
        status: run.status,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
      });
      return next;
    }
    case "mark_run_failed": {
      const run = requireRun(next);
      run.status = "failed";
      run.completedAt = action.at;
      run.updatedAt = action.at;
      if (action.reason?.trim()) {
        run.decisions.push({
          id: createId("decision"),
          decision: "Mark run failed",
          why: action.reason.trim(),
          evidenceRefs: [],
          createdAt: action.at,
        });
      }
      next.completedRuns.push({
        id: run.id,
        objective: run.objective,
        playbook: run.playbook,
        ceremony: run.ceremony,
        status: run.status,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
      });
      return next;
    }
    case "bind_goal": {
      const run = requireRun(next);
      run.goalRef = action.goalRef;
      run.updatedAt = action.at;
      return next;
    }
    case "set_fingerprint": {
      const run = requireRun(next);
      if (action.target === "baseline") run.baselineFingerprint = action.fingerprint;
      else run.lastKnownFingerprint = action.fingerprint;
      run.updatedAt = action.at;
      return next;
    }
    case "add_acceptance": {
      const run = requireRun(next);
      if (run.acceptance.some(item => item.id === action.criterion.id)) {
        throw new Error(`Acceptance criterion ${action.criterion.id} already exists.`);
      }
      run.acceptance.push({ ...action.criterion, evidenceRefs: [...action.criterion.evidenceRefs] });
      run.updatedAt = action.at;
      return next;
    }
    case "update_acceptance": {
      const run = requireRun(next);
      const criterion = run.acceptance.find(item => item.id === action.id);
      if (!criterion) throw new Error(`Acceptance criterion ${action.id} does not exist.`);
      if (action.state !== undefined) criterion.state = action.state;
      if (action.text !== undefined) criterion.text = action.text.trim();
      if (action.required !== undefined) criterion.required = action.required;
      if (action.evidenceRefs !== undefined) criterion.evidenceRefs = uniqueStrings(action.evidenceRefs);
      if (action.reason !== undefined) criterion.reason = action.reason.trim();
      criterion.updatedAt = action.at;
      run.updatedAt = action.at;
      return next;
    }
    case "remove_acceptance": {
      const run = requireRun(next);
      run.acceptance = run.acceptance.filter(item => item.id !== action.id);
      run.updatedAt = action.at;
      return next;
    }
    case "record_evidence": {
      const run = requireRun(next);
      const existing = run.evidence.findIndex(item => item.id === action.evidence.id);
      if (existing >= 0) run.evidence[existing] = { ...action.evidence };
      else run.evidence.push({ ...action.evidence });
      run.updatedAt = action.at;
      return next;
    }
    case "record_decision": {
      const run = requireRun(next);
      run.decisions.push({ ...action.decision, evidenceRefs: [...action.decision.evidenceRefs] });
      run.updatedAt = action.at;
      return next;
    }
    case "record_agent": {
      const run = requireRun(next);
      const existing = run.agents.findIndex(item => item.actorId === action.agent.actorId);
      if (existing >= 0) run.agents[existing] = { ...action.agent, modelPatterns: [...action.agent.modelPatterns] };
      else run.agents.push({ ...action.agent, modelPatterns: [...action.agent.modelPatterns] });
      run.updatedAt = action.at;
      return next;
    }
    case "update_agent": {
      const run = requireRun(next);
      const agent = run.agents.find(item => item.actorId === action.actorId);
      if (!agent) throw new Error(`Agent ${action.actorId} does not exist.`);
      Object.assign(agent, action.patch);
      agent.lastSeenAt = action.patch.lastSeenAt ?? action.at;
      if (["completed", "failed", "cancelled"].includes(agent.status) && !agent.completedAt) {
        agent.completedAt = action.at;
      }
      run.updatedAt = action.at;
      return next;
    }
    case "complete_agent": {
      const run = requireRun(next);
      const agent = run.agents.find(item => item.actorId === action.actorId);
      if (agent) {
        agent.status = action.failed ? "failed" : "completed";
        agent.lastSeenAt = action.at;
        agent.completedAt = action.at;
      }
      run.updatedAt = action.at;
      return next;
    }
    case "record_verdict": {
      const run = requireRun(next);
      const value = {
        ...action.verdict,
        writerActorIds: [...action.verdict.writerActorIds],
        evidenceRefs: [...action.verdict.evidenceRefs],
        observations: [...action.verdict.observations],
        limitations: [...action.verdict.limitations],
        testedFingerprint: {
          ...action.verdict.testedFingerprint,
          notes: [...action.verdict.testedFingerprint.notes],
        },
      };
      const existing = run.verdicts.findIndex(item => item.id === action.verdict.id);
      if (existing >= 0) run.verdicts[existing] = value;
      else run.verdicts.push(value);
      run.lastKnownFingerprint = action.verdict.testedFingerprint;
      run.updatedAt = action.at;
      return next;
    }
    case "increment_stop_gate": {
      const run = requireRun(next);
      run.stopGateAttempts += 1;
      run.updatedAt = action.at;
      return next;
    }
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
