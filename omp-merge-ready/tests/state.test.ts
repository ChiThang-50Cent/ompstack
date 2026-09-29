import { test, expect, describe } from "bun:test";

import {
	ContractError,
	DecisionError,
	TRANSITIONS,
	TransitionError,
	createRun,
	currentContract,
	isTerminal,
	proposeContract,
	recordDecision,
	stateFingerprint,
	transition,
} from "../extensions/merge-ready/state.ts";
import type { DecisionRecord, Phase, RunState } from "../extensions/merge-ready/types.ts";

const repo: RunState["repo"] = {
	root: "/repo",
	baseBranch: "main",
	startBranch: "feature/test",
};

function runAtSpecDiscovery(): RunState {
	return transition(createRun({ runId: "run-1", intent: "intent", repo, now: "2026-01-01T00:00:00Z" }), "SPEC_DISCOVERY", "", "2026-01-01T00:00:01Z");
}

function contractDraft(openQuestions: RunState["contracts"][number]["openQuestions"] = []) {
	return {
		summary: "A test contract",
		acceptance: [
			{
				id: "AC-1",
				behavior: "the requested behavior works",
				source: "derived" as const,
				confidence: "high" as const,
				required: true,
			},
		],
		constraints: [],
		verificationPlan: ["run the test"],
		rigor: "LOW" as const,
		openQuestions,
		rootCause: {
			statement: "The current implementation lacks the requested behavior.",
			evidence: [{ kind: "command" as const, ref: "repro", exitCode: 1 }],
		},
		siblingSites: [
			{
				location: "extensions/merge-ready",
				relation: "same lifecycle",
				decision: "unrelated" as const,
				rationale: "No sibling path exercises this behavior.",
			},
		],
		behaviorMatrix: [
			{ dimension: "inverse_direction", expectation: "n/a", rationale: "The operation is one-way." },
			{ dimension: "round_trip", expectation: "n/a", rationale: "No reversible representation exists." },
			{ dimension: "backward_compat", expectation: "Existing callers remain supported." },
		],
	};
}

function runAtReview(): RunState {
	let state = runAtSpecDiscovery();
	state = proposeContract(state, contractDraft(), "2026-01-01T00:00:02Z");
	state = transition(state, "CONTRACT_READY", "contract is complete", "2026-01-01T00:00:03Z");
	state = transition(state, "DESIGN", "design complete", "2026-01-01T00:00:04Z");
	state = transition(state, "IMPLEMENTING", "implementation complete", "2026-01-01T00:00:05Z");
	state = transition(state, "SELF_PROOF", "proof complete", "2026-01-01T00:00:06Z");
	state = transition(state, "PR_OPEN", "pull request opened", "2026-01-01T00:00:07Z");
	return transition(state, "REVIEW", "review requested", "2026-01-01T00:00:08Z");
}

describe("merge-ready state transitions", () => {
	test("rejects SPEC_DISCOVERY -> REVIEW", () => {
		expect(() => transition(runAtSpecDiscovery(), "REVIEW", "", "2026-01-01T00:00:02Z")).toThrow(TransitionError);
	});
	test("requires scope completeness before CONTRACT_READY", () => {
		const base = contractDraft();
		const noRootCause = { ...base, rootCause: undefined };
		expect(() =>
			transition(
				proposeContract(runAtSpecDiscovery(), noRootCause, "2026-01-01T00:00:02Z"),
				"CONTRACT_READY",
				"contract proposed",
				"2026-01-01T00:00:03Z",
			),
		).toThrow(/rootCause/);

		const missingInverse = {
			...base,
			behaviorMatrix: base.behaviorMatrix.filter((row) => row.dimension !== "inverse_direction"),
		};
		expect(() =>
			transition(
				proposeContract(runAtSpecDiscovery(), missingInverse, "2026-01-01T00:00:02Z"),
				"CONTRACT_READY",
				"contract proposed",
				"2026-01-01T00:00:03Z",
			),
		).toThrow(/inverse_direction/);

		const invalidFixSite = {
			...base,
			siblingSites: [
				{
					location: "extensions/merge-ready",
					relation: "same lifecycle",
					decision: "fix" as const,
					rationale: "This sibling is in scope.",
					acceptanceIds: ["AC-404"],
				},
			],
		};
		expect(() =>
			transition(
				proposeContract(runAtSpecDiscovery(), invalidFixSite, "2026-01-01T00:00:02Z"),
				"CONTRACT_READY",
				"contract proposed",
				"2026-01-01T00:00:03Z",
			),
		).toThrow(/unknown acceptance id/);
	});
	test("requires a recorded blocking question before clarification", () => {
		expect(() =>
			transition(runAtSpecDiscovery(), "CLARIFICATION_REQUIRED", "need clarification", "2026-01-01T00:00:02Z"),
		).toThrow(TransitionError);
		const state = proposeContract(
			runAtSpecDiscovery(),
			contractDraft([{ id: "Q-1", question: "Which policy?", blocking: true }]),
			"2026-01-01T00:00:02Z",
		);
		expect(
			transition(state, "CLARIFICATION_REQUIRED", "need clarification", "2026-01-01T00:00:03Z").phase,
		).toBe("CLARIFICATION_REQUIRED");
	});

	test("rejects REVIEW -> MERGE_READY without a merge_ready gate", () => {
		const state = runAtReview();
		expect(() => transition(state, "MERGE_READY", "done", "2026-01-01T00:00:09Z")).toThrow(TransitionError);
		expect(() => transition(state, "MERGE_READY", "done", "2026-01-01T00:00:09Z", {
			status: "blocked",
			missing: [],
			stale: [],
			failed: [],
		})).toThrow(TransitionError);
	});

	test("a working phase can pause for approval and returns only to the phase it left", () => {
		const review = runAtReview();
		expect(() => transition(review, "AWAITING_APPROVAL", "  ", "2026-01-01T00:00:09Z")).toThrow(TransitionError);
		const paused = transition(review, "AWAITING_APPROVAL", "approve local commit", "2026-01-01T00:00:09Z");
		expect(() => transition(paused, "VERIFY", "skip ahead", "2026-01-01T00:00:10Z")).toThrow(TransitionError);
		expect(transition(paused, "REVIEW", "approved", "2026-01-01T00:00:10Z").phase).toBe("REVIEW");
		expect(() => transition({ ...review, phase: "INTAKE" }, "AWAITING_APPROVAL", "x", "2026-01-01T00:00:09Z")).toThrow(
			TransitionError,
		);
	});

	test("local runs may go SELF_PROOF -> REVIEW while forge runs must open a PR", () => {
		const selfProof: RunState = { ...runAtReview(), phase: "SELF_PROOF" };
		expect(() => transition(selfProof, "REVIEW", "r", "2026-01-01T00:00:09Z")).toThrow(TransitionError);
		expect(transition({ ...selfProof, forge: "none" }, "REVIEW", "r", "2026-01-01T00:00:09Z").phase).toBe("REVIEW");
	});

	test("accepts FINAL_GATE -> MERGE_READY with a merge_ready gate", () => {
		let state = runAtReview();
		state = transition(state, "VERIFY", "verification complete", "2026-01-01T00:00:09Z");
		state = transition(state, "BABYSIT", "checks observed", "2026-01-01T00:00:10Z");
		state = transition(state, "FINAL_GATE", "gate evaluation", "2026-01-01T00:00:11Z");
		const next = transition(state, "MERGE_READY", "all gates pass", "2026-01-01T00:00:12Z", {
			status: "merge_ready",
			missing: [],
			stale: [],
			failed: [],
		});
		expect(next.phase).toBe("MERGE_READY");
		expect(next.phaseHistory.at(-1)).toEqual({
			from: "FINAL_GATE",
			to: "MERGE_READY",
			at: "2026-01-01T00:00:12Z",
			reason: "all gates pass",
		});
	});
	test("allows REVIEW -> SPEC_DISCOVERY and stales receipts after a contract update", () => {
		const review = runAtReview();
		const stateWithReceipt: RunState = {
			...review,
			receipts: [
				{
					id: "review-1",
					runId: review.runId,
					kind: "code_review",
					producer: { type: "agent", id: "reviewer" },
					patchId: "patch-1",
					contractVersion: 1,
					status: "pass",
					packetDigest: "packet-1",
					evidence: [{ kind: "file", ref: "review.txt" }],
					summary: "review passed",
					createdAt: "2026-01-01T00:00:08Z",
					stale: false,
				},
			],
		};
		const discovery = transition(
			stateWithReceipt,
			"SPEC_DISCOVERY",
			"product review found a scope gap",
			"2026-01-01T00:00:09Z",
		);
		expect(discovery.phase).toBe("SPEC_DISCOVERY");
		const changed = proposeContract(discovery, contractDraft(), "2026-01-01T00:00:10Z");
		expect(changed.contracts.at(-1)?.version).toBe(2);
		expect(changed.receipts[0]?.stale).toBe(true);
		expect(changed.receipts[0]?.staleReason).toContain("contract changed");
	});

	test("terminal phases have no outgoing edges", () => {
		const terminalPhases: Phase[] = [
			"MERGE_READY",
			"BLOCKED_PRODUCT",
			"BLOCKED_ENVIRONMENT",
			"BLOCKED_EXTERNAL",
			"INCONCLUSIVE",
			"ABORTED",
		];
		for (const phase of terminalPhases) {
			expect(isTerminal(phase)).toBe(true);
			expect(TRANSITIONS[phase]).toEqual([]);
			const state = { ...createRun({ runId: phase, intent: "intent", repo, now: "2026-01-01T00:00:00Z" }), phase };
			expect(() => transition(state, "IMPLEMENTING", "reopen", "2026-01-01T00:00:01Z")).toThrow(TransitionError);
		}
	});

	test("blocks CONTRACT_READY while a blocking question is unresolved", () => {
		const state = proposeContract(
			runAtSpecDiscovery(),
			contractDraft([{ id: "Q-1", question: "Which policy?", blocking: true }]),
			"2026-01-01T00:00:02Z",
		);
		expect(() => transition(state, "CONTRACT_READY", "contract proposed", "2026-01-01T00:00:03Z")).toThrow(TransitionError);
	});
});

describe("merge-ready contract and decision history", () => {
	test("does not allow a later contract to drop a user acceptance criterion", () => {
		const first = proposeContract(
			runAtSpecDiscovery(),
			{
				...contractDraft(),
				acceptance: [{
					id: "AC-USER",
					behavior: "user-selected behavior",
					source: "user",
					confidence: "high",
					required: true,
				}],
			},
			"2026-01-01T00:00:02Z",
		);
		expect(() => proposeContract(first, contractDraft(), "2026-01-01T00:00:03Z")).toThrow(ContractError);
		expect(currentContract(first)?.version).toBe(1);
	});

	test("proposing a new contract stales older verification receipts", () => {
		let first = proposeContract(
			runAtSpecDiscovery(),
			contractDraft(),
			"2026-01-01T00:00:02Z",
		);
		first = {
			...first,
			receipts: [
				{
					id: "R-VERIFY",
					runId: first.runId,
					kind: "self_verification",
					producer: { type: "root" },
					contractVersion: 1,
					status: "pass",
					evidence: [{ kind: "command", ref: "bun test", exitCode: 0 }],
					summary: "verification passed",
					createdAt: "2026-01-01T00:00:02Z",
					stale: false,
				},
			],
		};

		const second = proposeContract(first, contractDraft(), "2026-01-01T00:00:03Z");
		expect(second.receipts[0]?.stale).toBe(true);
		expect(second.receipts[0]?.staleReason).toContain("contract changed 1→2");
	});

	test("rejects non-user supersession of a user decision", () => {
		const userDecision: Omit<DecisionRecord, "id" | "contractVersion" | "createdAt"> = {
			question: "Which policy?",
			choice: "strict",
			source: "user",
			confidence: "high",
			reversibility: "one_way",
			evidence: [],
			rationale: "operator chose strict policy",
		};
		const state = recordDecision(runAtSpecDiscovery(), userDecision, "D-USER", "2026-01-01T00:00:02Z");
		expect(() => recordDecision(state, {
			...userDecision,
			choice: "lenient",
			source: "derived",
			supersedes: "D-USER",
		}, "D-DERIVED", "2026-01-01T00:00:03Z")).toThrow(DecisionError);
	});

	test("fingerprint changes when non-stale receipt count changes", () => {
		const state = runAtSpecDiscovery();
		const receipt = {
			id: "R-1",
			runId: state.runId,
			kind: "contract_check" as const,
			producer: { type: "root" as const },
			contractVersion: 0,
			status: "pass" as const,
			evidence: [],
			summary: "ok",
			createdAt: "2026-01-01T00:00:02Z",
			stale: false,
		};
		expect(stateFingerprint(state)).not.toBe(stateFingerprint({ ...state, receipts: [receipt] }));
		expect(stateFingerprint(state)).toBe(stateFingerprint({ ...state, receipts: [{ ...receipt, stale: true }] }));
	});
});
