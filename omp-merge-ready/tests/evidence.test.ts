import { expect, test } from "bun:test";
import {
	ReceiptError,
	addReceipt,
	applyContractChange,
	applyPatchChange,
	currentReceipts,
} from "../extensions/merge-ready/evidence.ts";
import type { EvidenceReceipt, ProductContract, RunState } from "../extensions/merge-ready/types.ts";

const contract = (version: number): ProductContract => ({
	version,
	summary: "test contract",
	acceptance: [
		{
			id: "AC-1",
			behavior: "works",
			source: "user",
			confidence: "high",
			required: true,
		},
	],
	constraints: [],
	verificationPlan: ["run tests"],
	rigor: "LOW",
	openQuestions: [],
	rootCause: {
		statement: "The old path lacks the requested behavior.",
		evidence: [{ kind: "command", ref: "repro", exitCode: 1 }],
	},
	siblingSites: [
		{
			location: "extensions/other",
			relation: "same lifecycle",
			decision: "unrelated",
			rationale: "The sibling is not affected.",
		},
	],
	behaviorMatrix: [
		{ dimension: "inverse_direction", expectation: "n/a", rationale: "One-way operation." },
		{ dimension: "round_trip", expectation: "n/a", rationale: "No reverse representation." },
		{ dimension: "backward_compat", expectation: "existing callers remain supported" },
	],
	createdAt: `2026-01-0${version}T00:00:00Z`,
});

function fixture(): RunState {
	return {
		schemaVersion: 1,
		runId: "run-1",
		intent: "test intent",
		forge: "github",
		phase: "FINAL_GATE",
		phaseHistory: [],
		contracts: [contract(1)],
		decisions: [],
		receipts: [],
		patch: { baseSha: "base-a", headSha: "head-a", patchId: "patch-a" },
		pr: undefined,
		issuedPacketDigests: [{ digest: "packet-digest", patchId: "patch-a", contractVersion: 1 }],
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
	};
}

function receipt(
	state: RunState,
	kind: EvidenceReceipt["kind"],
	overrides: Partial<Omit<EvidenceReceipt, "runId" | "stale" | "staleReason">> = {},
): Omit<EvidenceReceipt, "runId" | "stale" | "staleReason"> {
	return {
		id: `${kind}-1`,
		kind,
		producer: { type: "agent", id: `${kind}-producer` },
		baseSha: state.patch?.baseSha,
		headSha: state.patch?.headSha,
		patchId: state.patch?.patchId,
		contractVersion: state.contracts[state.contracts.length - 1]?.version ?? 0,
		status: "pass",
		evidence: [{ kind: "command", ref: `run ${kind}`, exitCode: 0 }],
		summary: `${kind} passed`,
		createdAt: "2026-01-01T00:00:00Z",
		...(kind === "code_review" || kind === "product_review" || kind === "security_review"
			? { packetDigest: "packet-digest" }
			: {}),
		...overrides,
	};
}

test("rejects receipts with empty evidence, wrong patch, or wrong contract version", () => {
	const state = fixture();
	const empty = receipt(state, "self_verification", { evidence: [] });
	expect(() => addReceipt(state, empty)).toThrow(ReceiptError);

	const wrongPatch = receipt(state, "self_verification", { patchId: "other-patch" });
	expect(() => addReceipt(state, wrongPatch)).toThrow(ReceiptError);

	const wrongContract = receipt(state, "self_verification", { contractVersion: 99 });
	expect(() => addReceipt(state, wrongContract)).toThrow(ReceiptError);
});

test("stales patch-bound review after a semantic patch change", () => {
	const state = addReceipt(fixture(), receipt(fixture(), "code_review"));
	const changed = applyPatchChange(
		state,
		{ baseSha: "base-b", headSha: "head-b", patchId: "patch-b" },
		"2026-01-02T00:00:00Z",
	);

	expect(state.receipts[0]?.stale).toBe(false);
	expect(changed.receipts[0]?.stale).toBe(true);
	expect(changed.receipts[0]?.staleReason).toContain("patch changed patch-a→patch-b");
	expect(changed.patch?.headSha).toBe("head-b");
});

test("retains review on an equivalent rebase but stales head-bound evidence", () => {
	let state = fixture();
	state = addReceipt(state, receipt(state, "code_review"));
	state = addReceipt(state, receipt(state, "self_verification"));
	state = addReceipt(state, receipt(state, "ci"));
	state = addReceipt(state, receipt(state, "mergeability"));

	const rebased = applyPatchChange(
		state,
		{ baseSha: "base-b", headSha: "head-b", patchId: "patch-a" },
		"2026-01-02T00:00:00Z",
	);

	expect(currentReceipts(rebased, "code_review")).toHaveLength(1);
	expect(currentReceipts(rebased, "self_verification")).toHaveLength(1);
	expect(rebased.receipts.find((item) => item.kind === "ci")?.stale).toBe(true);
	expect(rebased.receipts.find((item) => item.kind === "mergeability")?.stale).toBe(true);
});

test("stales old review and verification receipts when the contract changes", () => {
	let state = fixture();
	state = addReceipt(state, receipt(state, "code_review"));
	state = addReceipt(state, receipt(state, "self_verification"));
	state = { ...state, contracts: [...state.contracts, contract(2)] };
	const changed = applyContractChange(state);

	expect(changed.receipts.every((item) => item.stale)).toBe(true);
});

test("rejects review evidence whose packet digest is not issued for the current binding", () => {
	const state = fixture();
	const unissued = receipt(state, "code_review", { packetDigest: "unissued-digest" });
	expect(() => addReceipt(state, unissued)).toThrow(ReceiptError);

	const wrongBinding = {
		...state,
		issuedPacketDigests: [{ digest: "packet-digest", patchId: "other-patch", contractVersion: 1 }],
	};
	expect(() => addReceipt(wrongBinding, receipt(wrongBinding, "code_review"))).toThrow(ReceiptError);
});
