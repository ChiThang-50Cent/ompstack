/**
 * Pure state-machine operations for the merge-ready controller.
 *
 * This module intentionally has no OMP/runtime dependencies.  Controller state
 * is append-only at the contract/decision/receipt level; each operation returns
 * a new state object rather than mutating its input.
 */

import { createHash } from "node:crypto";
import { applyContractChange } from "./evidence.ts";
import { TERMINAL_PHASES } from "./types.ts";
import type {
	DecisionRecord,
	ForgeKind,
	GateResult,
	OpenQuestion,
	Phase,
	ProductContract,
	RunState,
} from "./types.ts";

export class TransitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TransitionError";
	}
}

export class ContractError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ContractError";
	}
}

export class DecisionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DecisionError";
	}
}

const BLOCKING_TERMINAL_PHASES: readonly Phase[] = [
	"BLOCKED_PRODUCT",
	"BLOCKED_ENVIRONMENT",
	"BLOCKED_EXTERNAL",
	"INCONCLUSIVE",
];


const TERMINAL_EXIT_PHASES: readonly Phase[] = [
	...BLOCKING_TERMINAL_PHASES,
	"ABORTED",
];

/**
 * Legal state-machine edges.  All non-terminal states may enter an explicit
 * blocked/abort outcome; terminal states deliberately have no outgoing edges.
 */
export const TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
	INTAKE: ["SPEC_DISCOVERY", ...TERMINAL_EXIT_PHASES],
	SPEC_DISCOVERY: ["CLARIFICATION_REQUIRED", "CONTRACT_READY", ...TERMINAL_EXIT_PHASES],
	CLARIFICATION_REQUIRED: ["CONTRACT_READY", ...TERMINAL_EXIT_PHASES],
	CONTRACT_READY: ["DESIGN", ...TERMINAL_EXIT_PHASES],
	DESIGN: ["IMPLEMENTING", ...TERMINAL_EXIT_PHASES],
	IMPLEMENTING: ["SELF_PROOF", ...TERMINAL_EXIT_PHASES],
	SELF_PROOF: ["PR_OPEN", ...TERMINAL_EXIT_PHASES],
	PR_OPEN: ["REVIEW", ...TERMINAL_EXIT_PHASES],
	REVIEW: ["IMPLEMENTING", "VERIFY", "SPEC_DISCOVERY", ...TERMINAL_EXIT_PHASES],
	VERIFY: ["IMPLEMENTING", "BABYSIT", "SPEC_DISCOVERY", ...TERMINAL_EXIT_PHASES],
	BABYSIT: ["IMPLEMENTING", "FINAL_GATE", "SPEC_DISCOVERY", ...TERMINAL_EXIT_PHASES],
	FINAL_GATE: [
		"REVIEW",
		"VERIFY",
		"BABYSIT",
		"SELF_PROOF",
		"PR_OPEN",
		"SPEC_DISCOVERY",
		"MERGE_READY",
		...TERMINAL_EXIT_PHASES,
	],
	MERGE_READY: [],
	BLOCKED_PRODUCT: [],
	BLOCKED_ENVIRONMENT: [],
	BLOCKED_EXTERNAL: [],
	INCONCLUSIVE: [],
	ABORTED: [],
};

const TERMINAL_PHASE_LOOKUP: Readonly<Partial<Record<Phase, true>>> = {
	MERGE_READY: true,
	BLOCKED_PRODUCT: true,
	BLOCKED_ENVIRONMENT: true,
	BLOCKED_EXTERNAL: true,
	INCONCLUSIVE: true,
	ABORTED: true,
};
const BLOCKING_TERMINAL_LOOKUP: Readonly<Partial<Record<Phase, true>>> = {
	BLOCKED_PRODUCT: true,
	BLOCKED_ENVIRONMENT: true,
	BLOCKED_EXTERNAL: true,
	INCONCLUSIVE: true,
};



function cloneOpenQuestions(questions: OpenQuestion[]): OpenQuestion[] {
	return questions.map((question) => ({
		...question,
		options: question.options ? [...question.options] : undefined,
	}));
}

function hasUnresolvedBlockingQuestion(contract: ProductContract): boolean {
	for (const question of contract.openQuestions) {
		if (question.blocking && !question.resolvedBy) return true;
	}
	return false;
}
function validateContractScope(contract: ProductContract): void {
	if (!contract.rootCause) {
		throw new TransitionError("CONTRACT_READY requires contract.rootCause with a statement and evidence");
	}
	if (typeof contract.rootCause.statement !== "string" || !contract.rootCause.statement.trim()) {
		throw new TransitionError("CONTRACT_READY requires rootCause.statement to be non-empty");
	}
	if (!Array.isArray(contract.rootCause.evidence) || contract.rootCause.evidence.length === 0) {
		throw new TransitionError("CONTRACT_READY requires rootCause.evidence to contain at least one pointer");
	}
	if (!Array.isArray(contract.siblingSites)) {
		throw new TransitionError("CONTRACT_READY requires siblingSites to be recorded (use [] when none are found)");
	}
	if (!Array.isArray(contract.behaviorMatrix)) {
		throw new TransitionError(
			"CONTRACT_READY requires behaviorMatrix rows for inverse_direction, round_trip, and backward_compat",
		);
	}
	if (contract.siblingSites.length === 0 && contract.behaviorMatrix.length === 0) {
		throw new TransitionError("CONTRACT_READY requires siblingSites or behaviorMatrix evidence to explain empty siblingSites");
	}
	const acceptanceIds = new Set(contract.acceptance.map((criterion) => criterion.id));
	for (const [index, site] of contract.siblingSites.entries()) {
		if (typeof site.location !== "string" || !site.location.trim()) {
			throw new TransitionError(`CONTRACT_READY requires siblingSites[${index}].location`);
		}
		if (typeof site.relation !== "string" || !site.relation.trim()) {
			throw new TransitionError(`CONTRACT_READY requires siblingSites[${index}].relation`);
		}
		if (site.decision === "fix") {
			if (!site.acceptanceIds || site.acceptanceIds.length === 0) {
				throw new TransitionError(
					`CONTRACT_READY requires siblingSites[${index}].acceptanceIds for a fix decision`,
				);
			}
			for (const acceptanceId of site.acceptanceIds) {
				if (!acceptanceIds.has(acceptanceId)) {
					throw new TransitionError(
						`CONTRACT_READY siblingSites[${index}].acceptanceIds references unknown acceptance id ${acceptanceId}`,
					);
				}
			}
		} else if (
			site.decision === "unrelated" &&
			(typeof site.rationale !== "string" || !site.rationale.trim())
		) {
			throw new TransitionError(
				`CONTRACT_READY requires siblingSites[${index}].rationale for an unrelated decision`,
			);
		}
	}
	const requiredDimensions = ["inverse_direction", "round_trip", "backward_compat"] as const;
	for (const dimension of requiredDimensions) {
		if (!contract.behaviorMatrix.some((row) => row.dimension === dimension)) {
			throw new TransitionError(`CONTRACT_READY requires behaviorMatrix.${dimension} row`);
		}
	}
	for (const [index, row] of contract.behaviorMatrix.entries()) {
		if (
			typeof row.expectation !== "string" ||
			(row.expectation.trim().toLowerCase() === "n/a" &&
				(typeof row.rationale !== "string" || !row.rationale.trim()))
		) {
			throw new TransitionError(
				`CONTRACT_READY requires behaviorMatrix[${index}].rationale when expectation is n/a`,
			);
		}
	}
}


function isPhase(value: string): value is Phase {
	return Object.prototype.hasOwnProperty.call(TRANSITIONS, value);
}


export function createRun(input: {
	runId: string;
	intent: string;
	repo: RunState["repo"];
	forge?: ForgeKind;
	now: string;
}): RunState {
	return {
		schemaVersion: 1,
		runId: input.runId,
		intent: input.intent,
		repo: { ...input.repo },
		forge: input.forge ?? "github",
		phase: "INTAKE",
		phaseHistory: [],
		contracts: [],
		decisions: [],
		receipts: [],
		consecutiveBlocks: 0,
		createdAt: input.now,
		updatedAt: input.now,
	};
}

export function transition(
	state: RunState,
	to: Phase,
	reason: string,
	now: string,
	gate?: GateResult,
): RunState {
	if (!isPhase(to) || !TRANSITIONS[state.phase].includes(to)) {
		throw new TransitionError(
			`invalid transition ${state.phase} -> ${to}; valid: ${(TRANSITIONS[state.phase] ?? []).join(", ") || "none"}`,
		);
	}

	if (to === "MERGE_READY" && gate?.status !== "merge_ready") {
		throw new TransitionError("MERGE_READY requires a merge_ready gate result");
	}

	if (to === "CLARIFICATION_REQUIRED") {
		const contract = currentContract(state);
		if (!contract || !hasUnresolvedBlockingQuestion(contract)) {
			throw new TransitionError(
				"CLARIFICATION_REQUIRED requires an unresolved blocking question in the current contract",
			);
		}
	}

	if (to === "CONTRACT_READY") {
		const contract = currentContract(state);
		if (!contract) {
			throw new TransitionError("CONTRACT_READY requires a current product contract");
		}
		validateContractScope(contract);
		if (hasUnresolvedBlockingQuestion(contract)) {
			throw new TransitionError("CONTRACT_READY is blocked by an unresolved blocking question");
		}
	}

	if (BLOCKING_TERMINAL_LOOKUP[to] === true && !reason.trim()) {
		throw new TransitionError(`${to} requires a non-empty reason`);
	}

	const history = [
		...state.phaseHistory,
		{ from: state.phase, to, at: now, reason },
	];
	const terminalReason =
		BLOCKING_TERMINAL_LOOKUP[to] === true || to === "ABORTED" ? (reason || undefined) : undefined;

	return {
		...state,
		phase: to,
		phaseHistory: history,
		terminalReason,
		updatedAt: now,
	};
}

export function currentContract(state: RunState): ProductContract | undefined {
	return state.contracts[state.contracts.length - 1];
}

export function proposeContract(
	state: RunState,
	draft: Omit<ProductContract, "version" | "createdAt">,
	now: string,
): RunState {
	const previous = currentContract(state);
	if (previous) {
		const draftIds = new Set(draft.acceptance.map((criterion) => criterion.id));
		for (const criterion of previous.acceptance) {
			if (criterion.source === "user" && !draftIds.has(criterion.id)) {
				throw new ContractError(
					`contract cannot drop user acceptance criterion ${criterion.id}`,
				);
			}
		}
	}

	const contract: ProductContract = {
		...draft,
		version: (previous?.version ?? 0) + 1,
		createdAt: now,
		acceptance: draft.acceptance.map((criterion) => ({ ...criterion })),
		constraints: [...draft.constraints],
		verificationPlan: [...draft.verificationPlan],
		openQuestions: cloneOpenQuestions(draft.openQuestions),
		rootCause: draft.rootCause
			? { statement: draft.rootCause.statement, evidence: draft.rootCause.evidence.map((pointer) => ({ ...pointer })) }
			: undefined,
		siblingSites: draft.siblingSites?.map((site) => ({
			...site,
			acceptanceIds: site.acceptanceIds ? [...site.acceptanceIds] : undefined,
		})),
		behaviorMatrix: draft.behaviorMatrix?.map((row) => ({
			...row,
			acceptanceIds: row.acceptanceIds ? [...row.acceptanceIds] : undefined,
		})),
	};

	const next: RunState = {
		...state,
		contracts: [...state.contracts, contract],
		updatedAt: now,
	};
	return applyContractChange(next);
}

export function recordDecision(
	state: RunState,
	d: Omit<DecisionRecord, "id" | "contractVersion" | "createdAt">,
	id: string,
	now: string,
): RunState {
	if (d.supersedes) {
		const superseded = state.decisions.find((decision) => decision.id === d.supersedes);
		if (superseded?.source === "user" && d.source !== "user") {
			throw new DecisionError("a user decision may only be superseded by another user decision");
		}
	}

	const decision: DecisionRecord = {
		...d,
		id,
		contractVersion: currentContract(state)?.version ?? 0,
		createdAt: now,
		evidence: d.evidence.map((pointer) => ({ ...pointer })),
	};

	return {
		...state,
		decisions: [...state.decisions, decision],
		updatedAt: now,
	};
}

export function resolveQuestion(
	state: RunState,
	questionId: string,
	decisionId: string,
	now: string,
): RunState {
	const contract = currentContract(state);
	if (!contract) {
		throw new ContractError("cannot resolve a question without a current contract");
	}

	const question = contract.openQuestions.find((candidate) => candidate.id === questionId);
	if (!question) {
		throw new ContractError(`unknown contract question ${questionId}`);
	}
	if (question.resolvedBy) {
		throw new ContractError(`contract question ${questionId} is already resolved`);
	}
	if (!state.decisions.some((decision) => decision.id === decisionId)) {
		throw new DecisionError(`unknown decision ${decisionId}`);
	}

	const draft: Omit<ProductContract, "version" | "createdAt"> = {
		...contract,
		openQuestions: contract.openQuestions.map((candidate) =>
			candidate.id === questionId ? { ...candidate, resolvedBy: decisionId } : { ...candidate },
		),
	};
	delete (draft as Partial<ProductContract>).version;
	delete (draft as Partial<ProductContract>).createdAt;

	return proposeContract(state, draft, now);
}

export function stateFingerprint(state: RunState): string {
	const payload = [
		state.phase,
		currentContract(state)?.version ?? 0,
		state.patch?.patchId ?? "",
		state.pr?.headSha ?? "",
		state.receipts.reduce((count, receipt) => count + (receipt.stale ? 0 : 1), 0),
	];
	return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function isTerminal(phase: Phase): boolean {
	return TERMINAL_PHASE_LOOKUP[phase] === true;
}

