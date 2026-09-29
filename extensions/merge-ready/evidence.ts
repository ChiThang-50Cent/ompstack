import type {
	EvidenceReceipt,
	PatchIdentity,
	ReceiptKind,
	RunState,
} from "./types.ts";

/**
 * Receipt kinds whose proof is tied to the production patch identity.
 * Product review audits contract scope, so only a contract change stales it.
 */
export const PATCH_BOUND_KINDS: readonly ReceiptKind[] = [
	"self_verification",
	"independent_verification",
	"code_review",
	"security_review",
	"ci",
	"mergeability",
];

const REVIEW_OR_VERIFICATION_KINDS: readonly ReceiptKind[] = [
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

export class ReceiptError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ReceiptError";
	}
}

function currentContractVersion(state: RunState): number | undefined {
	const contract = state.contracts[state.contracts.length - 1];
	return contract?.version;
}

function isPatchBound(kind: ReceiptKind): boolean {
	return PATCH_BOUND_KINDS.includes(kind);
}

function isReviewKind(kind: ReceiptKind): boolean {
	return REVIEW_KINDS.includes(kind);
}

/** Check that a review packet was issued for this exact patch and contract. */
export function isPacketIssued(state: RunState, digest: string): boolean {
	const contractVersion = currentContractVersion(state);
	const patchId = state.patch?.patchId;
	if (contractVersion === undefined || patchId === undefined) return false;
	return (state.issuedPacketDigests ?? []).some(
		(entry) =>
			entry.digest === digest &&
			entry.patchId === patchId &&
			entry.contractVersion === contractVersion,
	);
}

/** Check that a review packet was issued for any patch of the current contract. */
export function isPacketIssuedForContract(state: RunState, digest: string): boolean {
	const contractVersion = currentContractVersion(state);
	return (state.issuedPacketDigests ?? []).some(
		(entry) => entry.digest === digest && entry.contractVersion === contractVersion,
	);
}

function staleReceipt(receipt: EvidenceReceipt, reason: string): EvidenceReceipt {
	if (receipt.stale) return receipt;
	return { ...receipt, stale: true, staleReason: reason };
}

/** Add a validated receipt without mutating the input state. */
export function addReceipt(
	state: RunState,
	r: Omit<EvidenceReceipt, "stale" | "staleReason" | "runId">,
): RunState {
	if (!Array.isArray(r.evidence) || r.evidence.length === 0) {
		throw new ReceiptError("evidence receipt must include at least one evidence pointer");
	}

	const contractVersion = currentContractVersion(state);
	if (contractVersion === undefined || r.contractVersion !== contractVersion) {
		throw new ReceiptError(
			`receipt contractVersion ${r.contractVersion} does not match current contract ${contractVersion ?? "none"}`,
		);
	}

	if (isPatchBound(r.kind)) {
		if (!state.patch) {
			throw new ReceiptError(`${r.kind} receipt requires a current patch identity`);
		}
		if (r.patchId !== state.patch.patchId) {
			throw new ReceiptError(
			`${r.kind} receipt patchId ${r.patchId ?? "none"} does not match current patch ${state.patch.patchId}`,
			);
		}
	}

	if ((r.kind === "ci" || r.kind === "mergeability") && r.headSha !== state.patch?.headSha) {
		throw new ReceiptError(
			`${r.kind} receipt headSha ${r.headSha ?? "none"} does not match current head ${state.patch?.headSha ?? "none"}`,
		);
	}

	if (isReviewKind(r.kind)) {
		if (!r.packetDigest) {
			throw new ReceiptError(`${r.kind} receipt requires packetDigest`);
		}
		if (!isPacketIssued(state, r.packetDigest)) {
			throw new ReceiptError(
				`${r.kind} receipt packetDigest ${r.packetDigest} was not issued for the current patch and contract`,
			);
		}
	}

	const receipt: EvidenceReceipt = {
		...r,
		runId: state.runId,
		stale: false,
	};
	return { ...state, receipts: [...state.receipts, receipt] };
}

/**
 * Update patch identity and invalidate proof that no longer describes it.
 * Semantic-equivalent rebases retain review/verification receipts while
 * forcing head-bound CI and mergeability to run against the new head.
 */
export function applyPatchChange(
	state: RunState,
	next: PatchIdentity,
	now: string,
): RunState {
	const previous = state.patch;
	const patchChanged = previous?.patchId !== next.patchId;
	const headChanged = previous?.headSha !== next.headSha;
	const patchChangeReason = `patch changed ${previous?.patchId ?? "none"}→${next.patchId}`;
	const headChangeReason = `head changed ${previous?.headSha ?? "none"}→${next.headSha}`;

	const receipts = state.receipts.map((receipt) => {
		if (receipt.stale) return receipt;

		if (isPatchBound(receipt.kind) && patchChanged) {
			return staleReceipt(receipt, patchChangeReason);
		}
		if ((receipt.kind === "ci" || receipt.kind === "mergeability") && headChanged) {
			return staleReceipt(receipt, headChangeReason);
		}
		if (
			(receipt.kind === "ci" || receipt.kind === "mergeability") &&
			receipt.headSha !== next.headSha
		) {
			return staleReceipt(receipt, headChangeReason);
		}
		return receipt;
	});

	return {
		...state,
		patch: { ...next },
		receipts,
		updatedAt: now,
	};
}

/** Mark contract-bound review and verification proof from older versions stale. */
export function applyContractChange(state: RunState): RunState {
	const version = currentContractVersion(state);
	if (version === undefined) return state;

	const receipts = state.receipts.map((receipt) => {
		if (
			!receipt.stale &&
			receipt.contractVersion < version &&
			REVIEW_OR_VERIFICATION_KINDS.includes(receipt.kind)
		) {
			return staleReceipt(receipt, `contract changed ${receipt.contractVersion}→${version}`);
		}
		return receipt;
	});
	return { ...state, receipts };
}

/** Return only receipts that are eligible to satisfy a gate. */
export function currentReceipts(state: RunState, kind?: ReceiptKind): EvidenceReceipt[] {
	return state.receipts.filter((receipt) => !receipt.stale && (kind === undefined || receipt.kind === kind));
}
