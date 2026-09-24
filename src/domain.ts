export const PSTACK_STATE_VERSION = 2 as const;
export const PSTACK_STATE_ENTRY = "pstack-omp/state-v2";
export const PSTACK_AUDIT_ENTRY = "pstack-omp/audit-v1";

export const PSTACK_MODES = ["off", "auto", "strict"] as const;
export type PstackMode = (typeof PSTACK_MODES)[number];

export const CEREMONY_LEVELS = ["direct", "standard", "strict", "program"] as const;
export type CeremonyLevel = (typeof CEREMONY_LEVELS)[number];

export const PLAYBOOKS = [
  "investigation",
  "bug-fix",
  "feature",
  "empirical-prototype",
  "performance",
  "refactor",
  "migration",
  "incident",
  "review",
  "arena",
  "multi-phase",
  "shipping",
  "security",
  "test-repair",
  "dependency-upgrade",
  "documentation",
  "eval",
  "hillclimb",
  "trace-forensics",
  "runtime-forensics",
  "authoring-a-skill",
  "opening-a-pr",
  "babysit",
  "visual-parity",
  "autonomous-run",
  "pause-safely",
  "worktree-cleanup",
] as const;
export type Playbook = (typeof PLAYBOOKS)[number];

export const RUN_STATUSES = ["active", "done", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const ACCEPTANCE_STATES = ["open", "passed", "failed", "waived"] as const;
export type AcceptanceState = (typeof ACCEPTANCE_STATES)[number];

export const VERDICTS = ["PASS", "FAIL", "INCONCLUSIVE"] as const;
export type VerdictValue = (typeof VERDICTS)[number];

export const EVIDENCE_KINDS = [
  "command",
  "test",
  "benchmark",
  "screenshot",
  "trace",
  "diff",
  "observation",
  "document",
  "reproduction",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const AGENT_ROLES = [
  "scout",
  "architect",
  "builder",
  "reviewer",
  "judge",
  "synthesizer",
  "verifier",
  "coordinator",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export interface PstackConfig {
  defaultMode: PstackMode;
  writeAuditFiles: boolean;
  enforceIndependentVerifier: boolean;
  preferCrossFamilyVerifier: boolean;
  requireEvidenceForPass: boolean;
  requireArtifactFingerprint: boolean;
  maxPolicyCharacters: number;
  /** session_stop blocks allowed per auto/strict gate-only run before the session may end with open gates. */
  maxStopGateBlocks: number;
  auditDirectory: string;
  fingerprintIgnore: string[];
  maxWorkspaceFiles: number;
  maxHashedFileBytes: number;
}

export const DEFAULT_CONFIG: PstackConfig = {
  defaultMode: "off",
  writeAuditFiles: true,
  enforceIndependentVerifier: true,
  preferCrossFamilyVerifier: true,
  requireEvidenceForPass: true,
  requireArtifactFingerprint: true,
  maxPolicyCharacters: 8_000,
  maxStopGateBlocks: 0,
  auditDirectory: ".omp/pstack/runs",
  fingerprintIgnore: [
    ".git",
    ".omp/pstack",
    "node_modules",
    "dist",
    ".test-dist",
    "target",
    "vendor",
    ".venv",
  ],
  maxWorkspaceFiles: 20_000,
  maxHashedFileBytes: 25 * 1024 * 1024,
};

export interface ArtifactFingerprint {
  kind: "git" | "workspace";
  digest: string;
  generatedAt: string;
  headSha?: string;
  dirtyHash?: string;
  clean?: boolean;
  partial: boolean;
  notes: string[];
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
  required: boolean;
  state: AcceptanceState;
  reason?: string;
  evidenceRefs: string[];
  updatedAt: string;
}

export interface EvidenceRecord {
  id: string;
  kind: EvidenceKind;
  claim: string;
  ref: string;
  producedBy: string;
  createdAt: string;
  fingerprintDigest?: string;
  metadata?: Record<string, unknown>;
}

export interface DecisionRecord {
  id: string;
  phase?: string;
  decision: string;
  why: string;
  evidenceRefs: string[];
  result?: string;
  createdAt: string;
}

export const AGENT_STATUSES = ["spawned", "running", "completed", "failed", "cancelled", "unknown"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export interface AgentRecord {
  actorId: string;
  role: AgentRole;
  agentName: string;
  invocationKind: "task" | "eval" | "main";
  modelPatterns: string[];
  modelFamily?: string;
  spawnKey?: string;
  toolCallId?: string;
  runtimeAgentId?: string;
  jobId?: string;
  status: AgentStatus;
  spawnedAt: string;
  lastSeenAt?: string;
  completedAt?: string;
  lifecycleNote?: string;
}

export interface VerdictRecord {
  id: string;
  scope: string;
  verdict: VerdictValue;
  verifierActorId: string;
  writerActorIds: string[];
  evidenceRefs: string[];
  testedFingerprint: ArtifactFingerprint;
  observations: string[];
  limitations: string[];
  createdAt: string;
}

export interface PstackRun {
  id: string;
  objective: string;
  playbook: Playbook;
  ceremony: CeremonyLevel;
  status: RunStatus;
  verificationRequired: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** OMP goal id this run gates; completion follows `goal op=complete`. */
  goalRef?: string;
  acceptance: AcceptanceCriterion[];
  evidence: EvidenceRecord[];
  decisions: DecisionRecord[];
  agents: AgentRecord[];
  verdicts: VerdictRecord[];
  baselineFingerprint?: ArtifactFingerprint;
  lastKnownFingerprint?: ArtifactFingerprint;
  stopGateAttempts: number;
}

export interface PstackSessionState {
  version: typeof PSTACK_STATE_VERSION;
  mode: PstackMode;
  updatedAt: string;
  activeRun?: PstackRun;
  completedRuns: Array<Pick<PstackRun, "id" | "objective" | "playbook" | "ceremony" | "status" | "createdAt" | "completedAt">>;
}

export interface RouterDecision {
  playbook: Playbook;
  ceremony: CeremonyLevel;
  confidence: number;
  reasons: string[];
  verificationRequired: boolean;
}

export interface GateIssue {
  code:
    | "RUN_ACTIVE"
    | "ACCEPTANCE_OPEN"
    | "ACCEPTANCE_FAILED"
    | "VERDICT_MISSING"
    | "VERDICT_FAIL"
    | "VERDICT_INCONCLUSIVE"
    | "VERDICT_STALE"
    | "ACTOR_COLLISION"
    | "ACTOR_UNKNOWN"
    | "ROLE_MISMATCH"
    | "VERIFIER_NOT_COMPLETED"
    | "PASS_WITHOUT_EVIDENCE"
    | "FINGERPRINT_MISSING"
    | "AGENT_PENDING"
    | "SKIP_REASON_MISSING";
  message: string;
  blocking: boolean;
  refs: string[];
}

export interface GateReport {
  allowed: boolean;
  issues: GateIssue[];
  checkedAt: string;
}

export type PstackStateAction =
  | { type: "set_mode"; mode: PstackMode; at: string }
  | {
      type: "start_run";
      run: PstackRun;
      at: string;
    }
  | { type: "mark_run_done"; at: string }
  | { type: "mark_run_failed"; reason?: string; at: string }
  | { type: "bind_goal"; goalRef: string; at: string }
  | { type: "set_fingerprint"; fingerprint: ArtifactFingerprint; target: "baseline" | "lastKnown"; at: string }
  | { type: "add_acceptance"; criterion: AcceptanceCriterion; at: string }
  | {
      type: "update_acceptance";
      id: string;
      state?: AcceptanceState;
      text?: string;
      reason?: string;
      evidenceRefs?: string[];
      required?: boolean;
      at: string;
    }
  | { type: "remove_acceptance"; id: string; at: string }
  | { type: "record_evidence"; evidence: EvidenceRecord; at: string }
  | { type: "record_decision"; decision: DecisionRecord; at: string }
  | { type: "record_agent"; agent: AgentRecord; at: string }
  | {
      type: "update_agent";
      actorId: string;
      patch: Partial<Pick<AgentRecord, "status" | "toolCallId" | "runtimeAgentId" | "jobId" | "lastSeenAt" | "completedAt" | "lifecycleNote">>;
      at: string;
    }
  | { type: "complete_agent"; actorId: string; failed: boolean; at: string }
  | { type: "record_verdict"; verdict: VerdictRecord; at: string }
  | { type: "increment_stop_gate"; at: string };
