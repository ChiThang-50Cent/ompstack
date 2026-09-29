/**
 * Shared contracts for the merge-ready controller.
 * Every module depends on these; change them only in coordination.
 * Pure data + interfaces; no runtime imports.
 */

export type Phase =
	| "INTAKE"
	| "SPEC_DISCOVERY"
	| "CLARIFICATION_REQUIRED"
	| "CONTRACT_READY"
	| "DESIGN"
	| "IMPLEMENTING"
	| "SELF_PROOF"
	| "PR_OPEN"
	| "REVIEW"
	| "VERIFY"
	| "BABYSIT"
	| "FINAL_GATE"
	| "MERGE_READY"
	| "BLOCKED_PRODUCT"
	| "BLOCKED_ENVIRONMENT"
	| "BLOCKED_EXTERNAL"
	| "INCONCLUSIVE"
	| "ABORTED";

export const TERMINAL_PHASES: readonly Phase[] = [
	"MERGE_READY",
	"BLOCKED_PRODUCT",
	"BLOCKED_ENVIRONMENT",
	"BLOCKED_EXTERNAL",
	"INCONCLUSIVE",
	"ABORTED",
];

export type Rigor = "LOW" | "MEDIUM" | "HIGH";
export type ForgeKind = "github" | "none";

export type DecisionSource =
	| "user"
	| "existing_behavior"
	| "repo_convention"
	| "test_contract"
	| "doc_contract"
	| "history"
	| "derived"
	| "domain_default"
	| "assumption";

export type Confidence = "high" | "medium" | "low";
export type Reversibility = "cheap" | "moderate" | "expensive" | "one_way";

/** Concrete artifact reference. `ref` is a path, URL, command, or file:line. */
export interface EvidencePointer {
	kind: "command" | "file" | "url" | "log" | "test_report" | "ci_check" | "pr_comment" | "artifact";
	ref: string;
	/** Exit status for `command` pointers. */
	exitCode?: number;
	note?: string;
}

export interface AcceptanceCriterion {
	id: string; // "AC-1"
	behavior: string;
	source: DecisionSource;
	confidence: Confidence;
	reversibility?: Reversibility;
	/** Required ACs must be covered by passing current receipts for the gate. */
	required: boolean;
}

export interface DecisionRecord {
	id: string;
	contractVersion: number;
	question: string;
	choice: string;
	source: DecisionSource;
	confidence: Confidence;
	reversibility: Reversibility;
	evidence: EvidencePointer[];
	rationale: string;
	supersedes?: string;
	createdAt: string;
}

export interface OpenQuestion {
	id: string;
	question: string;
	/** Blocking = meets clarification threshold (P3); must be resolved before CONTRACT_READY. */
	blocking: boolean;
	options?: string[];
	resolvedBy?: string; // DecisionRecord id
}
export interface SiblingSite {
	location: string;
	relation: string;
	decision: "fix" | "unrelated";
	rationale: string;
	acceptanceIds?: string[];
}

export interface BehaviorRow {
	dimension: "happy_path" | "invalid_input" | "inverse_direction" | "round_trip" | "backward_compat" | string;
	expectation: string;
	rationale?: string;
	acceptanceIds?: string[];
}


export interface ProductContract {
	version: number;
	summary: string;
	acceptance: AcceptanceCriterion[];
	constraints: string[];
	verificationPlan: string[];
	rigor: Rigor;
	openQuestions: OpenQuestion[];
	createdAt: string;
	changeReason?: string;
	rootCause?: { statement: string; evidence: EvidencePointer[] };
	siblingSites?: SiblingSite[];
	behaviorMatrix?: BehaviorRow[];
}

export type ReceiptKind =
	| "repro_before"
	| "self_verification"
	| "independent_verification"
	| "code_review"
	| "product_review"
	| "security_review"
	| "ci"
	| "mergeability"
	| "contract_check";

export type ReceiptStatus = "pass" | "pass_with_notes" | "fail" | "inconclusive";

export interface EvidenceReceipt {
	id: string;
	runId: string;
	kind: ReceiptKind;
	producer: { type: "root" | "agent" | "ci" | "forge" | "script"; id?: string; model?: string };
	baseSha?: string;
	headSha?: string;
	patchId?: string;
	contractVersion: number;
	status: ReceiptStatus;
	/** AC ids this receipt covers (verification receipts). */
	covers?: string[];
	/** Digest of the frozen review packet (review receipts). */
	packetDigest?: string;
	/** Product-review findings that indicate missing scope coverage. */
	contractGaps?: string[];
	evidence: EvidencePointer[];
	summary: string;
	createdAt: string;
	stale: boolean;
	staleReason?: string;
}

export interface PatchIdentity {
	baseSha: string;
	headSha: string;
	/** `git patch-id --stable` over base...head; "" for an empty diff. */
	patchId: string;
}

export interface IssuedPacket {
	digest: string;
	patchId: string;
	contractVersion: number;
}

export interface PrState {
	number: number;
	url: string;
	headSha: string;
	isDraft: boolean;
	/** Forge-reported mechanical mergeability. */
	mergeable: "mergeable" | "conflicting" | "unknown";
	/** Aggregate of required checks on headSha. */
	checks: "pass" | "fail" | "pending" | "none";
	unresolvedBlockingThreads: number;
	/** Branch protection requires human approval that is absent. */
	approvalRequired: boolean;
	bodyDigest?: string;
	fetchedAt: string;
}

export interface RunState {
	schemaVersion: 1;
	runId: string;
	/** Immutable raw operator intent (P1). */
	intent: string;
	repo: { root: string; remote?: string; baseBranch: string; startBranch: string };
	forge: ForgeKind;
	phase: Phase;
	phaseHistory: { from: Phase; to: Phase; at: string; reason: string }[];
	contracts: ProductContract[]; // append-only; last = current
	decisions: DecisionRecord[]; // append-only
	receipts: EvidenceReceipt[]; // append-only; stale flag may flip true, never back
	patch?: PatchIdentity;
	/** Whether the latest controller refresh observed a clean working tree. */
	workingTreeClean?: boolean;
	/** Command most recently run by the local-checks controller tool. */
	checkCommand?: string;
	pr?: PrState;
	/** Review packet digests issued for the exact patch and contract binding. */
	issuedPacketDigests?: IssuedPacket[];
	/** Contract version the PR body was last written for; gate requires == current. */
	prBodyContractVersion?: number;
	/** Consecutive session_stop blocks without progress (§30). */
	consecutiveBlocks: number;
	/** Fingerprint of state at last block; progress = fingerprint changed. */
	lastBlockFingerprint?: string;
	terminalReason?: string;
	createdAt: string;
	updatedAt: string;
}

export interface GateResult {
	status: "merge_ready" | "ready_except_external_approval" | "blocked" | "terminal_blocked";
	missing: string[];
	stale: string[];
	failed: string[];
	/** Suggested phase to return to when blocked. */
	nextPhase?: Phase;
}

/** Git operations the controller needs; implemented over `git` CLI, fakeable in tests. */
export interface GitPort {
	revParse(ref: string): Promise<string>;
	mergeBase(a: string, b: string): Promise<string>;
	patchId(baseSha: string, headSha: string): Promise<string>;
	/** Return true for a clean merge-tree result, false for conflicts. */
	mergeTreeClean?(base: string, head: string): Promise<boolean>;
	/** Return the unified diff for the exact two revisions. */
	diff?(baseSha: string, headSha: string): Promise<string>;
	isClean(): Promise<boolean>;
	currentBranch(): Promise<string>;
	remoteUrl(name?: string): Promise<string | undefined>;
	root(): Promise<string>;
	/** Preferred remote default branch without the `origin/` prefix, if configured. */
	defaultBranch?(): Promise<string | undefined>;
}

/** Forge (GitHub) read operations. No merge method exists by design (P12). */
export interface ForgePort {
	readonly kind: "github" | "none";
	fetchPr(branchOrNumber: string | number): Promise<PrState | undefined>;
}

/** Persistence for RunState. */
export interface RunStore {
	load(runId: string): Promise<RunState | undefined>;
	save(state: RunState): Promise<void>;
	/** Active (non-terminal) run for a repo root, if any. */
	findActive(repoRoot: string): Promise<RunState | undefined>;
	/** Append a decision-trail line (§24). */
	appendTrail(runId: string, entry: Record<string, unknown>): Promise<void>;
	/** Directory holding controller state; guarded against direct edits. */
	readonly baseDir: string;
}
