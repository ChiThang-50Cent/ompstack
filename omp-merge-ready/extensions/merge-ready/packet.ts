import { createHash } from "node:crypto";
import { currentReceipts } from "./evidence.ts";
import type { RunState } from "./types.ts";

export interface ReviewPacket {
	runId: string;
	intent: string;
	contractVersion: number;
	contractDigest: string;
	baseSha: string;
	headSha: string;
	patchId: string;
	diffPathOrInline: string;
	contextPointers: string[];
	verificationReceipts: string[];
	knownAssumptions: string[];
	rubricVersion: string;
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry));
	if (value !== null && typeof value === "object") {
		const object = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(object).sort()) {
			sorted[key] = canonicalValue(object[key]);
		}
		return sorted;
	}
	return value;
}

/** Stable JSON representation with object keys sorted recursively. */
export function canonicalJson(value: unknown): string {
	const serialized = JSON.stringify(canonicalValue(value));
	if (serialized === undefined) throw new Error("cannot canonicalize undefined");
	return serialized;
}

/** SHA-256 digest of the canonical packet representation. */
export function packetDigest(packet: ReviewPacket): string {
	return createHash("sha256").update(canonicalJson(packet), "utf8").digest("hex");
}

/** Build the exact frozen packet reviewers must receive. */
export function buildReviewPacket(
	state: RunState,
	input: { diffPath: string; contextPointers: string[]; rubricVersion: string },
): ReviewPacket {
	const contract = state.contracts[state.contracts.length - 1];
	if (!contract) throw new Error("cannot build review packet without a current contract");
	if (!state.patch) throw new Error("cannot build review packet without a current patch identity");

	const verificationReceipts = currentReceipts(state)
		.filter(
			(receipt) =>
				receipt.kind === "self_verification" ||
				receipt.kind === "independent_verification",
		)
		.map((receipt) => receipt.id);
	const knownAssumptions = state.decisions
		.filter((decision) => decision.source === "assumption")
		.map((decision) => `${decision.question}: ${decision.choice}`);

	return {
		runId: state.runId,
		intent: state.intent,
		contractVersion: contract.version,
		contractDigest: createHash("sha256").update(canonicalJson(contract), "utf8").digest("hex"),
		baseSha: state.patch.baseSha,
		headSha: state.patch.headSha,
		patchId: state.patch.patchId,
		diffPathOrInline: input.diffPath,
		contextPointers: [...input.contextPointers],
		verificationReceipts,
		knownAssumptions,
		rubricVersion: input.rubricVersion,
	};
}

/** Record a packet digest bound to the patch and contract it was issued for. */
export function recordIssuedPacket(state: RunState, digest: string): RunState {
	if (!digest.trim()) throw new Error("cannot issue an empty review packet digest");
	const contract = state.contracts[state.contracts.length - 1];
	if (!contract) throw new Error("cannot issue a review packet without a current contract");
	if (!state.patch) throw new Error("cannot issue a review packet without a current patch identity");

	const issued = state.issuedPacketDigests ?? [];
	const entry = {
		digest,
		patchId: state.patch.patchId,
		contractVersion: contract.version,
	};
	if (
		issued.some(
			(candidate) =>
				candidate.digest === entry.digest &&
				candidate.patchId === entry.patchId &&
				candidate.contractVersion === entry.contractVersion,
		)
	) {
		return { ...state, issuedPacketDigests: [...issued] };
	}
	return { ...state, issuedPacketDigests: [...issued, entry] };
}
