import { isPacketIssued, isPacketIssuedForContract, PATCH_BOUND_KINDS } from "./evidence.ts";
import type {
	EvidenceReceipt,
	GateResult,
	Phase,
	ReceiptKind,
	ReceiptStatus,
	Rigor,
	RunState,
} from "./types.ts";

const TERMINAL_BLOCKED_PHASES = new Set<Phase>([
	"BLOCKED_PRODUCT",
	"BLOCKED_ENVIRONMENT",
	"BLOCKED_EXTERNAL",
	"INCONCLUSIVE",
	"ABORTED",
]);

const PASSING_STATUSES = new Set<ReceiptStatus>(["pass", "pass_with_notes"]);

function isPassing(receipt: EvidenceReceipt): boolean {
	return PASSING_STATUSES.has(receipt.status);
}

function receiptKey(receipt: EvidenceReceipt): string {
	return `${receipt.kind}\u0000${receipt.producer.id ?? ""}`;
}

const CONTRACT_BOUND_KINDS: readonly ReceiptKind[] = [
	"self_verification",
	"independent_verification",
	"code_review",
	"product_review",
	"security_review",
];

const REVIEW_KINDS: readonly ReceiptKind[] = [
	"code_review",
	"product_review",
	"security_review",
];

function matchesCurrentIdentity(state: RunState, receipt: EvidenceReceipt): boolean {
	const contractVersion = state.contracts[state.contracts.length - 1]?.version;
	if (CONTRACT_BOUND_KINDS.includes(receipt.kind) && receipt.contractVersion !== contractVersion) {
		return false;
	}
	if (PATCH_BOUND_KINDS.includes(receipt.kind)) {
		if (!state.patch || receipt.patchId !== state.patch.patchId) return false;
	}
	if (receipt.kind === "ci" || receipt.kind === "mergeability") {
		if (!state.patch || receipt.headSha !== state.patch.headSha) return false;
	}
	if (REVIEW_KINDS.includes(receipt.kind)) {
		if (!receipt.packetDigest) return false;
		const issued =
			receipt.kind === "product_review"
				? isPacketIssuedForContract(state, receipt.packetDigest)
				: isPacketIssued(state, receipt.packetDigest);
		if (!issued) return false;
	}
	return true;
}


function latestCurrentReceipts(state: RunState, kind: ReceiptKind): EvidenceReceipt[] {
	const latest = new Map<string, EvidenceReceipt>();
	for (const receipt of state.receipts) {
		if (receipt.stale || receipt.kind !== kind || !matchesCurrentIdentity(state, receipt)) continue;
		const key = receiptKey(receipt);
		const previous = latest.get(key);
		if (!previous || receipt.createdAt >= previous.createdAt) latest.set(key, receipt);
	}
	return [...latest.values()];
}

function describeReceipt(receipt: EvidenceReceipt): string {
	const producer = receipt.producer.id ?? receipt.producer.model;
	return producer ? `${receipt.kind} (${producer})` : receipt.kind;
}

function hasStaleKind(state: RunState, kind: ReceiptKind): boolean {
	return state.receipts.some((receipt) => receipt.stale && receipt.kind === kind);
}

/**
 * Passing code reviews from an earlier patch of the current contract whose
 * reviewer has not reviewed since. Patch fixes for one reviewer's finding
 * only need that reviewer's re-review; the others' passes carry forward.
 */
function carriedCodeReviews(state: RunState, current: EvidenceReceipt[]): EvidenceReceipt[] {
	const contractVersion = state.contracts[state.contracts.length - 1]?.version;
	const currentKeys = new Set(current.map(receiptKey));
	const latest = new Map<string, EvidenceReceipt>();
	for (const receipt of state.receipts) {
		if (receipt.kind !== "code_review" || receipt.contractVersion !== contractVersion) continue;
		const key = receiptKey(receipt);
		const previous = latest.get(key);
		if (!previous || receipt.createdAt >= previous.createdAt) latest.set(key, receipt);
	}
	return [...latest.values()].filter(
		(receipt) =>
			!currentKeys.has(receiptKey(receipt)) &&
			receipt.stale &&
			receipt.staleReason?.startsWith("patch changed") === true &&
			isPassing(receipt) &&
			!!receipt.packetDigest &&
			isPacketIssuedForContract(state, receipt.packetDigest),
	);
}

function distinctReviewerCount(receipts: EvidenceReceipt[], useModel: boolean): number {
	const identities = new Set<string>();
	for (const receipt of receipts) {
		if (!isPassing(receipt)) continue;
		const identity = useModel ? receipt.producer.model ?? receipt.producer.id : receipt.producer.id;
		if (identity) identities.add(identity);
	}
	return identities.size;
}
const RIGOR_RANK: Record<Rigor, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export interface RigorReason {
	level: Rigor;
	reason: string;
}

export function effectiveRigorReasons(state: RunState): RigorReason[] {
	const contract = state.contracts[state.contracts.length - 1];
	const reasons: RigorReason[] = [];
	for (const site of contract?.siblingSites ?? []) {
		if (site.decision === "fix") {
			reasons.push({ level: "MEDIUM", reason: `sibling site ${site.location} is in scope` });
		}
	}
	for (const row of contract?.behaviorMatrix ?? []) {
		if (
			(row.dimension === "inverse_direction" || row.dimension === "round_trip") &&
			row.expectation.trim().toLowerCase() !== "n/a"
		) {
			reasons.push({ level: "MEDIUM", reason: `${row.dimension} behavior is in scope` });
		}
	}
	return reasons;
}

export function effectiveRigor(state: RunState): Rigor {
	const contractRigor = state.contracts[state.contracts.length - 1]?.rigor ?? "LOW";
	let effective = contractRigor;
	for (const reason of effectiveRigorReasons(state)) {
		if (RIGOR_RANK[reason.level] > RIGOR_RANK[effective]) effective = reason.level;
	}
	return effective;
}

/** Evaluate the fail-closed merge-ready predicate without changing state. */
export function evaluateGate(state: RunState): GateResult {
	if (TERMINAL_BLOCKED_PHASES.has(state.phase)) {
		return {
			status: "terminal_blocked",
			missing: [],
			stale: [],
			failed: [],
		};
	}

	const missing: string[] = [];
	const stale: string[] = [];
	const failed: string[] = [];
	const addUnique = (target: string[], message: string): void => {
		if (!target.includes(message)) target.push(message);
	};
	const markNoCurrent = (kind: ReceiptKind): void => {
		if (hasStaleKind(state, kind)) {
			addUnique(stale, `${kind} receipt is stale and cannot satisfy the current gate`);
		} else {
			addUnique(missing, `missing current ${kind} receipt`);
		}
	};
	const requireKind = (kind: ReceiptKind): boolean => {
		const latest = latestCurrentReceipts(state, kind);
		if (latest.length === 0) {
			markNoCurrent(kind);
			return false;
		}
		let valid = true;
		for (const receipt of latest) {
			if (!isPassing(receipt)) {
				valid = false;
				addUnique(failed, `${describeReceipt(receipt)} is ${receipt.status}; rerun or resolve it`);
			}
		}
		return valid;
	};

	let contractIssue = false;
	let scopeDiscoveryIssue = false;
	let selfProofIssue = false;
	let prIssue = false;
	let reviewIssue = false;
	let verificationIssue = false;
	let babysitIssue = false;

	const contract = state.contracts[state.contracts.length - 1];
	if (!state.intent.trim()) {
		contractIssue = true;
		addUnique(missing, "run intent is empty");
	}
	if (!contract) {
		contractIssue = true;
		addUnique(missing, "missing current product contract");
	}
	if (contract) {
		const unresolved = contract.openQuestions.filter((question) => question.blocking && !question.resolvedBy);
		if (unresolved.length > 0) {
			contractIssue = true;
			addUnique(
				missing,
				`unresolved blocking contract questions: ${unresolved.map((question) => question.id).join(", ")}`,
			);
		}
	}

	if (!state.patch) {
		selfProofIssue = true;
		addUnique(missing, "missing current patch identity");
	}

	const selfPasses = requireKind("self_verification");
	if (!selfPasses) selfProofIssue = true;

	const declaredRigor = contract?.rigor ?? "LOW";
	const rigor = effectiveRigor(state);
	if (RIGOR_RANK[rigor] > RIGOR_RANK[declaredRigor]) {
		for (const reason of effectiveRigorReasons(state)) {
			if (RIGOR_RANK[reason.level] > RIGOR_RANK[declaredRigor]) {
				addUnique(
					missing,
					`rigor raised to ${rigor} by ${reason.reason}; satisfy ${rigor} requirements`,
				);
			}
		}
	}
	const needsIndependent = rigor === "MEDIUM" || rigor === "HIGH";
	const needsSecurity = rigor === "HIGH";

	const verificationPasses = needsIndependent ? requireKind("independent_verification") : true;
	if (needsIndependent && !verificationPasses) verificationIssue = true;

	const requiredAcceptance = contract?.acceptance.filter((criterion) => criterion.required) ?? [];
	const passingVerification = [
		...latestCurrentReceipts(state, "self_verification"),
		...latestCurrentReceipts(state, "independent_verification"),
	].filter(isPassing);
	for (const criterion of requiredAcceptance) {
		const covered = passingVerification.some((receipt) => receipt.covers?.includes(criterion.id));
		if (covered) continue;
		const staleCoverage = state.receipts.some(
			(receipt) => receipt.stale && receipt.covers?.includes(criterion.id),
		);
		if (staleCoverage) {
			addUnique(stale, `stale verification for required acceptance criterion ${criterion.id}`);
		} else {
			addUnique(missing, `required acceptance criterion ${criterion.id} lacks passing verification coverage`);
		}
		if (needsIndependent) verificationIssue = true;
		else selfProofIssue = true;
	}

	if (rigor !== "LOW" && !requireKind("product_review")) reviewIssue = true;
	for (const receipt of latestCurrentReceipts(state, "product_review")) {
		if (receipt.contractGaps && receipt.contractGaps.length > 0) {
			scopeDiscoveryIssue = true;
			addUnique(failed, `product review contract gaps: ${receipt.contractGaps.join("; ")}`);
			reviewIssue = true;
		}
	}

	const codeReviews = latestCurrentReceipts(state, "code_review");
	const requiredReviewers = rigor === "LOW" ? 1 : 2;
	if (codeReviews.length === 0) {
		markNoCurrent("code_review");
		reviewIssue = true;
	} else {
		let allCodeReviewsPass = true;
		for (const receipt of codeReviews) {
			if (!isPassing(receipt)) {
				allCodeReviewsPass = false;
				addUnique(failed, `${describeReceipt(receipt)} is ${receipt.status}; rerun or resolve it`);
			}
		}
		const carried = carriedCodeReviews(state, codeReviews);
		const distinct = distinctReviewerCount([...codeReviews, ...carried], rigor === "HIGH");
		if (!allCodeReviewsPass || distinct < requiredReviewers) reviewIssue = true;
		if (distinct < requiredReviewers) {
			const identity = rigor === "HIGH" ? "distinct reviewer models or ids" : "distinct reviewer ids";
			addUnique(missing, `code review requires ${requiredReviewers} ${identity}; found ${distinct}`);
			if (hasStaleKind(state, "code_review")) {
				addUnique(stale, "code_review receipts from an older contract version or failed reviews cannot count toward reviewer independence");
			}
		}
	}

	const localMode = (state.forge ?? "github") === "none";
	const pr = state.pr;
	if (localMode) {
		if (state.workingTreeClean !== true) {
			babysitIssue = true;
			addUnique(missing, "working tree is not known to be clean; run mr_refresh");
		}
		if (!state.patch?.patchId) {
			selfProofIssue = true;
			addUnique(missing, "current branch has no changes relative to base");
		}
		const requireLocalScriptKind = (kind: "ci" | "mergeability"): boolean => {
			const latest = latestCurrentReceipts(state, kind).filter((receipt) => receipt.producer.type === "script");
			if (latest.length === 0) {
				markNoCurrent(kind);
				return false;
			}
			let valid = true;
			for (const receipt of latest) {
				if (!isPassing(receipt)) {
					valid = false;
					addUnique(failed, `${describeReceipt(receipt)} is ${receipt.status}; rerun or resolve it`);
				}
			}
			return valid;
		};
		if (!requireLocalScriptKind("ci")) babysitIssue = true;
		if (!requireLocalScriptKind("mergeability")) babysitIssue = true;
	} else {
		if (!pr) {
			prIssue = true;
			addUnique(missing, "pull request has not been opened");
		} else {
			if (pr.isDraft) {
				prIssue = true;
				addUnique(failed, "pull request is still a draft");
			}
			if (state.patch && pr.headSha !== state.patch.headSha) {
				prIssue = true;
				addUnique(failed, `pull request head ${pr.headSha} does not match local patch head ${state.patch.headSha}`);
			}
		}

		const ciPasses = requireKind("ci");
		if (!ciPasses) babysitIssue = true;
		const mergeabilityPasses = requireKind("mergeability");
		if (!mergeabilityPasses) babysitIssue = true;

		if (pr) {
			if (pr.checks !== "pass") {
				babysitIssue = true;
				addUnique(failed, `pull request checks are ${pr.checks}, not pass`);
			}
			if (pr.mergeable !== "mergeable") {
				babysitIssue = true;
				addUnique(failed, `pull request is ${pr.mergeable}, not mergeable`);
			}
			if (pr.unresolvedBlockingThreads !== 0) {
				babysitIssue = true;
				addUnique(failed, `pull request has ${pr.unresolvedBlockingThreads} unresolved blocking threads`);
			}
			if (contract && state.prBodyContractVersion !== contract.version) {
				babysitIssue = true;
				addUnique(
					missing,
					`pull request body contract version ${state.prBodyContractVersion ?? "none"} does not match ${contract.version}`,
				);
			}
		}
	}

	if (contractIssue || selfProofIssue || prIssue || reviewIssue || verificationIssue || babysitIssue) {
		let nextPhase: Phase;
		if (scopeDiscoveryIssue) nextPhase = "SPEC_DISCOVERY";
		else if (contractIssue) nextPhase = "CONTRACT_READY";
		else if (selfProofIssue) nextPhase = "SELF_PROOF";
		else if (prIssue) nextPhase = "PR_OPEN";
		else if (reviewIssue) nextPhase = "REVIEW";
		else if (verificationIssue) nextPhase = "VERIFY";
		else nextPhase = "BABYSIT";
		return { status: "blocked", missing, stale, failed, nextPhase };
	}

	if (!localMode && pr?.approvalRequired) {
		return {
			status: "ready_except_external_approval",
			missing,
			stale,
			failed,
		};
	}
	return { status: "merge_ready", missing, stale, failed };
}
