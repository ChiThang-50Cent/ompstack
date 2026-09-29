import { expect, test } from "bun:test";
import { addReceipt, applyPatchChange } from "../extensions/merge-ready/evidence.ts";
import { evaluateGate } from "../extensions/merge-ready/gate.ts";
import type { EvidenceReceipt, ProductContract, Rigor, RunState } from "../extensions/merge-ready/types.ts";

function contract(rigor: Rigor): ProductContract {
	return {
		version: 1,
		summary: "test contract",
		acceptance: [
			{
				id: "AC-1",
				behavior: "the requested behavior works",
				source: "user",
				confidence: "high",
				required: true,
			},
		],
		constraints: [],
		verificationPlan: ["run the test suite"],
		rigor,
		openQuestions: [],
		rootCause: {
			statement: "The old path does not implement the requested behavior.",
			evidence: [{ kind: "command", ref: "repro", exitCode: 1 }],
		},
		siblingSites: [
			{
				location: "extensions/other",
				relation: "related lifecycle",
				decision: "unrelated",
				rationale: "The sibling does not handle this behavior.",
			},
		],
		behaviorMatrix: [
			{ dimension: "inverse_direction", expectation: "n/a", rationale: "The operation is one-way." },
			{ dimension: "round_trip", expectation: "n/a", rationale: "No reverse representation exists." },
			{ dimension: "backward_compat", expectation: "existing callers remain supported" },
		],
		createdAt: "2026-01-01T00:00:00Z",
	};
}

function fixture(rigor: Rigor = "LOW"): RunState {
	return {
		schemaVersion: 1,
		runId: "run-1",
		intent: "ship the requested behavior",
		repo: { root: "/tmp/repo", baseBranch: "main", startBranch: "feature" },
		forge: "github",
		phase: "FINAL_GATE",
		phaseHistory: [],
		contracts: [contract(rigor)],
		decisions: [],
		receipts: [],
		patch: { baseSha: "base-a", headSha: "head-a", patchId: "patch-a" },
		pr: {
			number: 42,
			url: "https://example.test/pr/42",
			headSha: "head-a",
			isDraft: false,
			mergeable: "mergeable",
			checks: "pass",
			unresolvedBlockingThreads: 0,
			approvalRequired: false,
		},
		issuedPacketDigests: [{ digest: "packet-digest", patchId: "patch-a", contractVersion: 1 }],
		prBodyContractVersion: 1,
		consecutiveBlocks: 0,
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
	};
}

function receipt(
	state: RunState,
	kind: EvidenceReceipt["kind"],
	overrides: Partial<Omit<EvidenceReceipt, "runId" | "stale" | "staleReason">> = {},
): Omit<EvidenceReceipt, "runId" | "stale" | "staleReason"> {
	const index = state.receipts.length + 1;
	const review = kind === "code_review" || kind === "product_review" || kind === "security_review";
	return {
		id: `${kind}-${index}`,
		kind,
		producer: { type: "agent", id: `${kind}-producer-${index}` },
		baseSha: state.patch?.baseSha,
		headSha: state.patch?.headSha,
		patchId: state.patch?.patchId,
		contractVersion: state.contracts[state.contracts.length - 1]?.version ?? 0,
		status: "pass",
		covers: kind === "self_verification" || kind === "independent_verification" ? ["AC-1"] : undefined,
		packetDigest: review ? "packet-digest" : undefined,
		evidence: [{ kind: "command", ref: `run ${kind}`, exitCode: 0 }],
		summary: `${kind} result`,
		createdAt: `2026-01-01T00:00:0${index}Z`,
		...overrides,
	};
}

function withLowEvidence(state: RunState): RunState {
	let next = addReceipt(state, receipt(state, "self_verification"));
	next = addReceipt(next, receipt(next, "code_review", { producer: { type: "agent", id: "reviewer-a" } }));
	next = addReceipt(next, receipt(next, "product_review"));
	next = addReceipt(next, receipt(next, "ci"));
	next = addReceipt(next, receipt(next, "mergeability"));
	return next;
}
function localFixture(): RunState {
	const state = fixture();
	return {
		...state,
		forge: "none",
		pr: undefined,
		workingTreeClean: true,
	};
}

function withLocalEvidence(state: RunState, includeCi = true): RunState {
	const prepared: RunState = {
		...state,
		issuedPacketDigests: [
			{
				digest: "packet-digest",
				patchId: state.patch?.patchId ?? "",
				contractVersion: state.contracts[state.contracts.length - 1]?.version ?? 0,
			},
		],
	};
	let next = addReceipt(prepared, receipt(prepared, "self_verification"));
	next = addReceipt(next, receipt(next, "code_review", { producer: { type: "agent", id: "reviewer-a" } }));
	next = addReceipt(next, receipt(next, "product_review"));
	if (includeCi) {
		next = addReceipt(next, receipt(next, "ci", { producer: { type: "script", id: "local-checks" } }));
	}
	return addReceipt(next, receipt(next, "mergeability", { producer: { type: "script", id: "git-merge-tree" } }));
}

test("full passing low-rigor path reaches merge_ready", () => {
	const result = evaluateGate(withLowEvidence(fixture()));
	expect(result.status).toBe("merge_ready");
	expect(result.missing).toEqual([]);
	expect(result.stale).toEqual([]);
	expect(result.failed).toEqual([]);
});
test("effective rigor rises for a sibling fix and requires medium evidence", () => {
	const base = fixture();
	const stateWithFix: RunState = {
		...base,
		contracts: [
			{
				...base.contracts[0],
				siblingSites: [
					{
						location: "extensions/other",
						relation: "same lifecycle",
						decision: "fix",
						rationale: "The sibling has the same defect.",
						acceptanceIds: ["AC-1"],
					},
				],
			},
		],
	};
	let state = withLowEvidence(stateWithFix);
	let result = evaluateGate(state);
	expect(result.status).toBe("blocked");
	expect(result.missing.some((message) => message.includes("rigor raised to MEDIUM"))).toBe(true);
	expect(result.nextPhase).toBe("REVIEW");

	state = addReceipt(state, receipt(state, "independent_verification"));
	state = addReceipt(state, receipt(state, "code_review", { producer: { type: "agent", id: "reviewer-b" } }));
	expect(evaluateGate(state).status).toBe("merge_ready");
});

function toPatchB(state: RunState): RunState {
	const next = applyPatchChange(state, { baseSha: "base-a", headSha: "head-b", patchId: "patch-b" }, "2026-01-01T00:00:10Z");
	return {
		...next,
		pr: next.pr ? { ...next.pr, headSha: "head-b" } : next.pr,
		issuedPacketDigests: [
			...(next.issuedPacketDigests ?? []),
			{ digest: "packet-b", patchId: "patch-b", contractVersion: 1 },
		],
	};
}

function reviewersThenFix(firstB: "pass" | "fail"): RunState {
	let state = fixture("MEDIUM");
	state = addReceipt(state, receipt(state, "code_review", { producer: { type: "agent", id: "reviewer-a" }, status: "fail" }));
	state = addReceipt(state, receipt(state, "code_review", { producer: { type: "agent", id: "reviewer-b" }, status: firstB }));
	state = addReceipt(state, receipt(state, "product_review"));
	state = toPatchB(state);
	for (const kind of ["self_verification", "independent_verification", "ci", "mergeability"] as const) {
		state = addReceipt(state, receipt(state, kind));
	}
	return addReceipt(
		state,
		receipt(state, "code_review", { producer: { type: "agent", id: "reviewer-a" }, packetDigest: "packet-b" }),
	);
}

test("after a review-fix patch, only the failing reviewer must re-review", () => {
	// reviewer-b's earlier pass and the product review carry forward to patch-b.
	expect(evaluateGate(reviewersThenFix("pass")).status).toBe("merge_ready");
});

test("a reviewer whose latest review failed does not carry forward", () => {
	const result = evaluateGate(reviewersThenFix("fail"));
	expect(result.status).toBe("blocked");
	expect(result.missing.some((message) => message.includes("2 distinct reviewer ids"))).toBe(true);
});

test("a contract change stales carried reviews and product review", () => {
	const state = reviewersThenFix("pass");
	const bumped: RunState = {
		...state,
		contracts: [...state.contracts, { ...state.contracts[0], version: 2 }],
	};
	expect(evaluateGate(bumped).status).toBe("blocked");
});

test("low-rigor runs do not require product review", () => {
	let state = addReceipt(fixture(), receipt(fixture(), "self_verification"));
	state = addReceipt(state, receipt(state, "code_review", { producer: { type: "agent", id: "reviewer-a" } }));
	state = addReceipt(state, receipt(state, "ci"));
	state = addReceipt(state, receipt(state, "mergeability"));
	expect(evaluateGate(state).status).toBe("merge_ready");
});

test("product-review contract gaps send the gate back to spec discovery", () => {
	const low = withLowEvidence(fixture());
	const state: RunState = {
		...low,
		receipts: low.receipts.map((entry) =>
			entry.kind === "product_review"
				? { ...entry, contractGaps: ["inverse direction is unspecified"] }
				: entry,
		),
	};
	const result = evaluateGate(state);
	expect(result.status).toBe("blocked");
	expect(result.nextPhase).toBe("SPEC_DISCOVERY");
	expect(result.failed.some((message) => message.includes("inverse direction is unspecified"))).toBe(true);
});

test("external approval produces ready_except_external_approval", () => {
	const state = withLowEvidence(fixture());
	const approvalRequired = {
		...state,
		pr: state.pr ? { ...state.pr, approvalRequired: true } : state.pr,
	};
	expect(evaluateGate(approvalRequired).status).toBe("ready_except_external_approval");
});

test("medium rigor requires two distinct passing reviewers", () => {
	let state = fixture("MEDIUM");
	state = addReceipt(state, receipt(state, "self_verification"));
	state = addReceipt(state, receipt(state, "independent_verification"));
	state = addReceipt(state, receipt(state, "code_review", { producer: { type: "agent", id: "reviewer-a" } }));
	state = addReceipt(state, receipt(state, "product_review"));
	state = addReceipt(state, receipt(state, "ci"));
	state = addReceipt(state, receipt(state, "mergeability"));

	const oneReviewer = evaluateGate(state);
	expect(oneReviewer.status).toBe("blocked");
	expect(oneReviewer.nextPhase).toBe("REVIEW");
	expect(oneReviewer.missing.some((message) => message.includes("2 distinct reviewer ids"))).toBe(true);

	state = addReceipt(
		state,
		receipt(state, "code_review", { producer: { type: "agent", id: "reviewer-b" } }),
	);
	expect(evaluateGate(state).status).toBe("merge_ready");
});

test("inconclusive verification never satisfies the gate", () => {
	let state = fixture("MEDIUM");
	state = addReceipt(state, receipt(state, "self_verification"));
	state = addReceipt(state, receipt(state, "independent_verification", { status: "inconclusive" }));
	state = addReceipt(state, receipt(state, "code_review", { producer: { type: "agent", id: "reviewer-a" } }));
	state = addReceipt(
		state,
		receipt(state, "code_review", { producer: { type: "agent", id: "reviewer-b" } }),
	);
	state = addReceipt(state, receipt(state, "product_review"));
	state = addReceipt(state, receipt(state, "ci"));
	state = addReceipt(state, receipt(state, "mergeability"));

	const result = evaluateGate(state);
	expect(result.status).toBe("blocked");
	expect(result.nextPhase).toBe("VERIFY");
	expect(result.failed.some((message) => message.includes("inconclusive"))).toBe(true);
});

test("a review passing on patch A is stale after patch B and blocks at review", () => {
	let state = withLowEvidence(fixture());
	state = applyPatchChange(
		state,
		{ baseSha: "base-b", headSha: "head-b", patchId: "patch-b" },
		"2026-01-02T00:00:00Z",
	);
	state = {
		...state,
		pr: state.pr ? { ...state.pr, headSha: "head-b" } : state.pr,
	};
	state = addReceipt(state, receipt(state, "self_verification"));
	state = addReceipt(state, receipt(state, "ci"));
	state = addReceipt(state, receipt(state, "mergeability"));

	const result = evaluateGate(state);
	expect(result.status).toBe("blocked");
	expect(result.nextPhase).toBe("REVIEW");
	expect(result.stale.some((message) => message.includes("code_review"))).toBe(true);
});

test("gate ignores non-stale receipts with a mismatched patch identity", () => {
	const valid = withLowEvidence(fixture());
	const state = {
		...valid,
		receipts: valid.receipts.map((receipt) =>
			receipt.kind === "code_review" ? { ...receipt, patchId: "wrong-patch" } : receipt,
		),
	};

	const result = evaluateGate(state);
	expect(result.status).toBe("blocked");
	expect(result.nextPhase).toBe("REVIEW");
	expect(result.missing.some((message) => message.includes("code_review"))).toBe(true);
});

test("gate ignores a review receipt whose packet digest was not issued", () => {
	const valid = withLowEvidence(fixture());
	const state = { ...valid, issuedPacketDigests: [] };
	const result = evaluateGate(state);

	expect(result.status).toBe("blocked");
	expect(result.nextPhase).toBe("REVIEW");
	expect(result.missing.some((message) => message.includes("code_review"))).toBe(true);
});
test("local mode reaches merge_ready without a pull request", () => {
	const result = evaluateGate(withLocalEvidence(localFixture()));
	expect(result.status).toBe("merge_ready");
	expect(result.missing).toEqual([]);
	expect(result.stale).toEqual([]);
	expect(result.failed).toEqual([]);
});

test("local mode requires controller-produced checks", () => {
	const result = evaluateGate(withLocalEvidence(localFixture(), false));
	expect(result.status).toBe("blocked");
	expect(result.nextPhase).toBe("BABYSIT");
	expect(result.missing.some((message) => message.includes("ci"))).toBe(true);
});

test("local mode blocks a dirty tree or empty patch", () => {
	const dirty = evaluateGate(withLocalEvidence({ ...localFixture(), workingTreeClean: false }));
	expect(dirty.status).toBe("blocked");
	expect(dirty.missing.some((message) => message.includes("working tree"))).toBe(true);

	const empty = evaluateGate(
		withLocalEvidence({
			...localFixture(),
			patch: { baseSha: "base-a", headSha: "head-a", patchId: "" },
		}),
	);
	expect(empty.status).toBe("blocked");
	expect(empty.missing.some((message) => message.includes("no changes"))).toBe(true);
});

function withEvidenceTest(skipped: string[]): RunState {
	const state = localFixture();
	const [current] = state.contracts;
	const acceptance = current!.acceptance.map((criterion) => ({ ...criterion, evidenceTests: ["test_reopening"] }));
	const base = withLocalEvidence({ ...state, contracts: [{ ...current!, acceptance }] }, false);
	return addReceipt(base, receipt(base, "ci", { producer: { type: "script", id: "local-checks" }, skipped }));
}

test("a skipped proof test named by an acceptance criterion blocks the gate", () => {
	const result = evaluateGate(withEvidenceTest(["skipped TestClose.test_reopening_catches_up: MongoDB is not configured"]));
	expect(result.status).toBe("blocked");
	expect(result.failed.some((message) => message.includes("AC-1") && message.includes("test_reopening"))).toBe(true);
});

test("unrelated skipped tests do not block the gate", () => {
	expect(evaluateGate(withEvidenceTest(["skipped TestImage.test_heic: pillow-heif missing"])).status).toBe("merge_ready");
});
