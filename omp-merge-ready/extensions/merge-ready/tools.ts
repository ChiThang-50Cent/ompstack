import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";

import { agentModelRole } from "./agents";
import { parseSkippedTests } from "./checks";
import { addReceipt, applyPatchChange } from "./evidence";
import { effectiveRigor, effectiveRigorReasons, evaluateGate } from "./gate";
import { computePatchIdentity, resolveBaseRef } from "./patch";
import { buildReviewPacket, packetDigest, recordIssuedPacket } from "./packet";
import {
	currentContract,
	proposeContract,
	recordDecision,
	resolveQuestion,
	stateFingerprint,
	allowedTransitions,
	transition,
} from "./state";
import type { ForgePort, GitPort, GateResult, RunState, RunStore } from "./types";

export interface ToolPorts {
	git: GitPort;
	forge: ForgePort;
}

/** Dependencies are deliberately plain interfaces so tests can inject fakes. */
export interface MergeReadyToolDependencies {
	store: RunStore;
	git: GitPort;
	forge: ForgePort;
	now: () => string;
	newId: () => string;
	portsForCwd?: (cwd: string) => ToolPorts | Promise<ToolPorts>;
	appendEntry?: (customType: string, data: unknown) => void;
}

interface ToolResult {
	content: [{ type: "text"; text: string }];
	details: unknown;
}

type ToolInput = Record<string, unknown>;

function textResult(text: string, details: unknown = {}): ToolResult {
	return { content: [{ type: "text", text }], details };
}

function inputRecord(params: unknown): ToolInput {
	if (!params || typeof params !== "object" || Array.isArray(params)) return {};
	return params as ToolInput;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireMain(ctx: ExtensionContext, toolName: string): void {
	if (ctx.agent.kind !== "main") throw new Error(`${toolName} is only available in the main merge-ready session`);
}

async function resolvePorts(deps: MergeReadyToolDependencies, ctx: ExtensionContext): Promise<ToolPorts> {
	if (deps.portsForCwd) return await deps.portsForCwd(ctx.cwd);
	return { git: deps.git, forge: deps.forge };
}

async function activeRun(
	deps: MergeReadyToolDependencies,
	ctx: ExtensionContext,
	ports?: ToolPorts,
): Promise<{ run: RunState | undefined; ports: ToolPorts; repoRoot?: string }> {
	const resolvedPorts = ports ?? (await resolvePorts(deps, ctx));
	const repoRoot = await resolvedPorts.git.root();
	return { run: await deps.store.findActive(repoRoot), ports: resolvedPorts, repoRoot };
}

const LOCAL_CHECK_TIMEOUT_MS = 5 * 60 * 1000;
/** A review diff spanning more files than this usually means the base branch is wrong. */
const LARGE_DIFF_FILES = 100;

interface LocalCheckResult {
	exitCode: number;
	output: string;
	timedOut: boolean;
}

async function runLocalCheck(command: string, cwd: string): Promise<LocalCheckResult> {
	const process = Bun.spawn(["/usr/bin/sh", "-lc", command], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		process.kill();
	}, LOCAL_CHECK_TIMEOUT_MS);
	try {
		const [streams, exitCode] = await Promise.all([
			Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text()]),
			process.exited,
		]);
		const output = [streams[0], streams[1]].filter((part) => part.length > 0).join("\n");
		return { exitCode: timedOut ? 124 : exitCode, output, timedOut };
	} finally {
		clearTimeout(timer);
	}
}
async function refreshLocalEvidence(
	deps: MergeReadyToolDependencies,
	state: RunState,
	git: GitPort,
): Promise<RunState> {
	if ((state.forge ?? "github") !== "none") return state;
	if (!git.mergeTreeClean) throw new Error("git adapter cannot compute local mergeability");
	const baseRef = await resolveBaseRef(git, state.repo.baseBranch);
	const mergeTreeCommand = `git merge-tree --write-tree ${baseRef} HEAD`;
	const mergeClean = await git.mergeTreeClean(baseRef, "HEAD");
	const workingTreeClean = await git.isClean();
	let next: RunState = {
		...state,
		workingTreeClean,
		updatedAt: deps.now(),
	};
	const contract = currentContract(next);
	if (!contract || !next.patch) return next;
	return addReceipt(next, {
		id: deps.newId(),
		kind: "mergeability",
		producer: { type: "script", id: "git-merge-tree" },
		baseSha: next.patch.baseSha,
		headSha: next.patch.headSha,
		patchId: next.patch.patchId,
		contractVersion: contract.version,
		status: mergeClean ? "pass" : "fail",
		evidence: [{ kind: "command", ref: mergeTreeCommand, exitCode: mergeClean ? 0 : 1 }],
		summary: mergeClean ? "git merge-tree reports a clean merge" : "git merge-tree reports merge conflicts",
		createdAt: deps.now(),
	});
}
/** GitHub mode: derive ci/mergeability receipts from forge state for the current head. */
async function refreshForgeEvidence(
	deps: MergeReadyToolDependencies,
	state: RunState,
	ports: ToolPorts,
): Promise<RunState> {
	const pr = await ports.forge.fetchPr(state.pr?.number ?? (await ports.git.currentBranch()));
	let next: RunState = { ...state, pr, updatedAt: deps.now() };
	const contract = currentContract(next);
	if (!pr || !contract || !next.patch || pr.headSha !== next.patch.headSha) return next;
	const bound = {
		producer: { type: "forge" as const, id: "gh" },
		baseSha: next.patch.baseSha,
		headSha: next.patch.headSha,
		patchId: next.patch.patchId,
		contractVersion: contract.version,
		createdAt: deps.now(),
	};
	if (pr.checks !== "pending") {
		next = addReceipt(next, {
			...bound,
			id: deps.newId(),
			kind: "ci",
			status: pr.checks === "pass" ? "pass" : pr.checks === "none" ? "inconclusive" : "fail",
			evidence: [{ kind: "url", ref: pr.url, note: `checks=${pr.checks}` }],
			summary: `PR #${pr.number} checks: ${pr.checks}`,
		});
	}
	if (pr.mergeable !== "unknown") {
		next = addReceipt(next, {
			...bound,
			id: deps.newId(),
			kind: "mergeability",
			status: pr.mergeable === "mergeable" ? "pass" : "fail",
			evidence: [{ kind: "url", ref: pr.url, note: `mergeable=${pr.mergeable}` }],
			summary: `PR #${pr.number} mergeable: ${pr.mergeable}`,
		});
	}
	return next;
}

async function refreshEvidence(deps: MergeReadyToolDependencies, state: RunState, ports: ToolPorts): Promise<RunState> {
	return (state.forge ?? "github") === "none"
		? await refreshLocalEvidence(deps, state, ports.git)
		: await refreshForgeEvidence(deps, state, ports);
}

async function saveState(deps: MergeReadyToolDependencies, state: RunState, operation: string): Promise<void> {
	await deps.store.save(state);
	await deps.store.appendTrail(state.runId, {
		at: deps.now(),
		operation,
		phase: state.phase,
		fingerprint: stateFingerprint(state),
	});
	deps.appendEntry?.("merge-ready/state", {
		runId: state.runId,
		phase: state.phase,
		updatedAt: state.updatedAt,
	});
}

function stateSummary(state: RunState | undefined): Record<string, unknown> {
	if (!state) return { active: false };
	const contract = currentContract(state);
	const currentReceipts = state.receipts.filter((receipt) => !receipt.stale);
	const rigorReasons = effectiveRigorReasons(state);
	return {
		active: true,
		runId: state.runId,
		intent: state.intent,
		phase: state.phase,
		repo: state.repo,
		forge: state.forge ?? "github",
		checkCommand: state.checkCommand,
		workingTreeClean: state.workingTreeClean,
		contractVersion: contract?.version,
		effectiveRigor: effectiveRigor(state),
		validTransitions: allowedTransitions(state),
		gate: evaluateGate(state),
		skippedTests: currentReceipts.filter((receipt) => receipt.kind === "ci").flatMap((receipt) => receipt.skipped ?? []),
		effectiveRigorReasons: rigorReasons.map((entry) => `${entry.level}: ${entry.reason}`),
		contract,
		patch: state.patch,
		pr: state.pr,
		receipts: {
			current: currentReceipts.length,
			stale: state.receipts.length - currentReceipts.length,
			byKind: currentReceipts.reduce<Record<string, number>>((counts, receipt) => {
				counts[receipt.kind] = (counts[receipt.kind] ?? 0) + 1;
				return counts;
			}, {}),
		},
		consecutiveBlocks: state.consecutiveBlocks,
		terminalReason: state.terminalReason,
	};
}

function renderGate(gate: GateResult): string {
	const sections: string[] = [`merge-ready gate: ${gate.status}`];
	if (gate.nextPhase) sections.push(`next phase: ${gate.nextPhase}`);
	if (gate.missing.length > 0) sections.push(`missing: ${gate.missing.join("; ")}`);
	if (gate.stale.length > 0) sections.push(`stale: ${gate.stale.join("; ")}`);
	if (gate.failed.length > 0) sections.push(`failed: ${gate.failed.join("; ")}`);
	return sections.join("\n");
}
function rejectLocalGiveUp(state: RunState, to: string, gate: GateResult): void {
	if ((state.forge ?? "github") !== "none") return;
	if (to !== "BLOCKED_ENVIRONMENT" && to !== "BLOCKED_EXTERNAL") return;
	if (gate.status !== "blocked") return;
	const remaining = [...gate.missing, ...gate.stale, ...gate.failed];
	throw new Error(
		`local merge-ready mode cannot stop for a missing PR; complete local steps first${remaining.length > 0 ? `: ${remaining.join("; ")}` : ""}`,
	);
}

interface SchemaNode {
	optional(): SchemaNode;
}

interface SchemaApi {
	object(shape: Record<string, unknown>): unknown;
	string(): SchemaNode;
	number(): SchemaNode;
	boolean(): SchemaNode;
	enum(values: readonly [string, ...string[]]): SchemaNode;
	array(value: unknown): SchemaNode;
	any(): SchemaNode;
	unknown(): SchemaNode;
}

function schemaApi(pi: ExtensionAPI): SchemaApi {
	return pi.zod as unknown as SchemaApi;
}

function schema(pi: ExtensionAPI, shape: Record<string, unknown>): unknown {
	return schemaApi(pi).object(shape);
}

function optional(zod: unknown): unknown {
	if (zod && typeof zod === "object" && "optional" in zod && typeof zod.optional === "function") {
		return zod.optional();
	}
	return zod;
}

function anySchema(pi: ExtensionAPI): unknown {
	const z = schemaApi(pi);
	return z.any();
}

function register(
	pi: ExtensionAPI,
	name: string,
	label: string,
	description: string,
	parameters: unknown,
	execute: (toolCallId: string, params: unknown, signal: AbortSignal | undefined, onUpdate: unknown, ctx: ExtensionContext) => Promise<ToolResult>,
): void {
	pi.registerTool({
		name,
		label,
		description,
		parameters: parameters as never,
		execute,
	});
}

/** Register all model-facing merge-ready tools. */
export function registerTools(pi: ExtensionAPI, deps: MergeReadyToolDependencies): void {
	const z = schemaApi(pi);
	const stringSchema = z.string();
	const evidencePointerSchema = schema(pi, {
		kind: z.enum(["command", "file", "url", "log", "test_report", "ci_check", "pr_comment", "artifact"]),
		ref: stringSchema,
		exitCode: optional(z.number()),
		note: optional(stringSchema),
	});
	const acceptanceSchema = schema(pi, {
		id: stringSchema,
		behavior: stringSchema,
		source: z.enum(["user", "existing_behavior", "repo_convention", "test_contract", "doc_contract", "history", "derived", "domain_default", "assumption"]),
		confidence: z.enum(["high", "medium", "low"]),
		reversibility: optional(z.enum(["cheap", "moderate", "expensive", "one_way"])),
		required: z.boolean(),
		evidenceTests: optional(z.array(stringSchema)),
	});
	const questionSchema = schema(pi, {
		id: stringSchema,
		question: stringSchema,
		blocking: z.boolean(),
		options: optional(z.array(stringSchema)),
		resolvedBy: optional(stringSchema),
	});
	const rootCauseSchema = schema(pi, {
		statement: stringSchema,
		evidence: z.array(evidencePointerSchema),
	});
	const siblingSiteSchema = schema(pi, {
		location: stringSchema,
		relation: stringSchema,
		decision: z.enum(["fix", "unrelated"]),
		rationale: stringSchema,
		acceptanceIds: optional(z.array(stringSchema)),
	});
	const behaviorRowSchema = schema(pi, {
		dimension: stringSchema,
		expectation: stringSchema,
		rationale: optional(stringSchema),
		acceptanceIds: optional(z.array(stringSchema)),
	});
	const contractDraftSchema = schema(pi, {
		summary: stringSchema,
		acceptance: z.array(acceptanceSchema),
		constraints: z.array(stringSchema),
		verificationPlan: z.array(stringSchema),
		rigor: z.enum(["LOW", "MEDIUM", "HIGH"]),
		openQuestions: z.array(questionSchema),
		changeReason: optional(stringSchema),
		rootCause: optional(rootCauseSchema),
		siblingSites: optional(z.array(siblingSiteSchema)),
		behaviorMatrix: optional(z.array(behaviorRowSchema)),
	});
	const decisionSchema = schema(pi, {
		question: stringSchema,
		choice: stringSchema,
		source: z.enum(["user", "existing_behavior", "repo_convention", "test_contract", "doc_contract", "history", "derived", "domain_default", "assumption"]),
		confidence: z.enum(["high", "medium", "low"]),
		reversibility: z.enum(["cheap", "moderate", "expensive", "one_way"]),
		evidence: z.array(evidencePointerSchema),
		rationale: stringSchema,
		supersedes: optional(stringSchema),
	});
	const receiptSchema = schema(pi, {
		id: stringSchema,
		kind: z.enum(["repro_before", "self_verification", "independent_verification", "code_review", "product_review", "security_review", "ci", "mergeability", "contract_check"]),
		producer: schema(pi, {
			type: z.enum(["root", "agent", "ci", "forge", "script"]),
			id: optional(stringSchema),
			model: optional(stringSchema),
		}),
		baseSha: optional(stringSchema),
		headSha: optional(stringSchema),
		patchId: optional(stringSchema),
		contractVersion: z.number(),
		status: z.enum(["pass", "pass_with_notes", "fail", "inconclusive"]),
		covers: optional(z.array(stringSchema)),
		packetDigest: optional(stringSchema),
		contractGaps: optional(z.array(stringSchema)),
		evidence: z.array(evidencePointerSchema),
		summary: stringSchema,
	});
	const unknownSchema = anySchema(pi);
	const stateParams = schema(pi, {});

	register(pi, "mr_state", "Merge-ready state", "Read the active merge-ready run, contract, patch, PR, and evidence summary.", stateParams, async (_id, _params, _signal, _onUpdate, ctx) => {
		const active = await activeRun(deps, ctx);
		const details = stateSummary(active.run);
		return textResult(active.run ? JSON.stringify(details, null, 2) : "No active merge-ready run.", details);
	});

	const contractOperation = z.enum(["get", "propose_version", "record_decision", "resolve_question", "set_base"]);
	register(
		pi,
		"mr_contract",
		"Merge-ready contract",
		"Inspect or append a validated product-contract version and decisions. op=set_base with baseBranch changes the branch the patch, review diff, and mergeability are measured against (default: origin HEAD), then refreshes evidence.",
		schema(pi, {
			op: optional(contractOperation),
			draft: optional(contractDraftSchema),
			decision: optional(decisionSchema),
			id: optional(stringSchema),
			questionId: optional(stringSchema),
			decisionId: optional(stringSchema),
			baseBranch: optional(stringSchema),
		}),
		async (_id, rawParams, _signal, _onUpdate, ctx) => {
			const params = inputRecord(rawParams);
			const operation = stringValue(params.op) ?? stringValue(params.operation) ?? "get";
			if (operation !== "get") requireMain(ctx, "mr_contract");
			const active = await activeRun(deps, ctx);
			if (!active.run) return textResult("No active merge-ready run.", { active: false });
			if (operation === "get") {
				const details = stateSummary(active.run);
				return textResult(JSON.stringify(details, null, 2), details);
			}
			let next: RunState;
			if (operation === "propose_version") {
				const draft = (params.draft && typeof params.draft === "object" ? params.draft : params) as never;
				next = proposeContract(active.run, draft, deps.now());
			} else if (operation === "record_decision") {
				const decision = (params.decision && typeof params.decision === "object" ? params.decision : params) as never;
				next = recordDecision(active.run, decision, stringValue(params.id) ?? deps.newId(), deps.now());
			} else if (operation === "resolve_question") {
				const questionId = stringValue(params.questionId);
				const decisionId = stringValue(params.decisionId);
				if (!questionId || !decisionId) throw new Error("mr_contract resolve_question requires questionId and decisionId");
				next = resolveQuestion(active.run, questionId, decisionId, deps.now());
			} else if (operation === "set_base") {
				const baseBranch = stringValue(params.baseBranch);
				if (!baseBranch) throw new Error("mr_contract set_base requires baseBranch");
				await active.ports.git.revParse(await resolveBaseRef(active.ports.git, baseBranch));
				const rebased: RunState = { ...active.run, repo: { ...active.run.repo, baseBranch }, updatedAt: deps.now() };
				const patch = await computePatchIdentity(active.ports.git, baseBranch);
				next = await refreshEvidence(deps, applyPatchChange(rebased, patch, deps.now()), active.ports);
			} else {
				throw new Error(`unknown mr_contract operation: ${operation}`);
			}
			await saveState(deps, next, `mr_contract:${operation}`);
			const details = stateSummary(next);
			return textResult(JSON.stringify(details, null, 2), details);
		},
	);

	register(
		pi,
		"mr_receipt",
		"Merge-ready evidence receipt",
		"Record patch- and contract-bound evidence for the active run.",
		schema(pi, { receipt: optional(receiptSchema) }),
		async (_id, rawParams, _signal, _onUpdate, ctx) => {
			requireMain(ctx, "mr_receipt");
			const params = inputRecord(rawParams);
			const active = await activeRun(deps, ctx);
			if (!active.run) return textResult("No active merge-ready run.", { active: false });
			const receipt = (params.receipt && typeof params.receipt === "object" ? params.receipt : params) as ToolInput;
			const receiptKind = receipt.kind;
			const producer =
				receipt.producer && typeof receipt.producer === "object" ? (receipt.producer as ToolInput) : undefined;
			// ci/mergeability and script/forge-produced evidence are controller-owned:
			// the model cannot assert them (it could otherwise claim producer "script").
			if (receiptKind === "ci" || receiptKind === "mergeability") {
				throw new Error(`${receiptKind} receipts are produced by the controller (mr_refresh / mr_run_checks)`);
			}
			if (producer?.type === "script" || producer?.type === "forge" || producer?.type === "ci") {
				throw new Error(`producer type ${String(producer.type)} is reserved for the controller`);
			}
			// The gate orders receipts by createdAt, so the controller owns the timestamp.
			// Agent model identity comes from the agent definition, not the root's claim.
			const role = producer?.type === "agent" && typeof producer.id === "string" ? await agentModelRole(producer.id) : undefined;
			const bound = role ? { ...receipt, producer: { ...producer, model: role } } : receipt;
			const next = addReceipt(active.run, { ...bound, createdAt: deps.now() } as never);
			await saveState(deps, next, "mr_receipt");
			return textResult(JSON.stringify(stateSummary(next), null, 2), stateSummary(next));
		},
	);

	register(pi, "mr_gate", "Merge-ready gate", "Evaluate whether the active run has all current evidence required to finish.", stateParams, async (_id, _params, _signal, _onUpdate, ctx) => {
		const active = await activeRun(deps, ctx);
		if (!active.run) return textResult("No active merge-ready run.", { active: false });
		const gate = evaluateGate(active.run);
		return textResult(renderGate(gate), gate);
	});

	register(
		pi,
		"mr_run_checks",
		"Run local checks",
		"Run the requested repository check command with a bounded timeout and record its output as controller evidence.",
		schema(pi, { command: stringSchema }),
		async (_id, rawParams, _signal, _onUpdate, ctx) => {
			requireMain(ctx, "mr_run_checks");
			const params = inputRecord(rawParams);
			const command = stringValue(params.command);
			if (!command) throw new Error("mr_run_checks requires a non-empty command");
			const active = await activeRun(deps, ctx);
			if (!active.run) return textResult("No active merge-ready run.", { active: false });
			if (!active.run.patch) throw new Error("mr_run_checks requires a current patch identity");
			const patch = active.run.patch;
			const contract = currentContract(active.run);
			if (!contract) throw new Error("mr_run_checks requires a current product contract");
			const checkId = deps.newId();
			const runDir = join(deps.store.baseDir, "runs", active.run.runId);
			const outputPath = join(runDir, `check-${checkId}.log`);
			await mkdir(runDir, { recursive: true });
			const result = await runLocalCheck(command, active.repoRoot ?? ctx.cwd);
			await writeFile(outputPath, result.output, "utf8");
			const workingTreeClean = await active.ports.git.isClean();
			const stateWithCommand: RunState = {
				...active.run,
				checkCommand: command,
				workingTreeClean,
				updatedAt: deps.now(),
			};
			const skipped = parseSkippedTests(result.output);
			const next = addReceipt(stateWithCommand, {
				id: checkId,
				kind: "ci",
				producer: { type: "script", id: "local-checks" },
				baseSha: patch.baseSha,
				headSha: patch.headSha,
				patchId: patch.patchId,
				contractVersion: contract.version,
				status: result.exitCode === 0 ? "pass" : "fail",
				evidence: [
					{ kind: "command", ref: command, exitCode: result.exitCode },
					{ kind: "file", ref: outputPath },
				],
				skipped,
				summary:
					(result.timedOut
						? `local check timed out after ${LOCAL_CHECK_TIMEOUT_MS}ms`
						: result.exitCode === 0
							? "local checks passed"
							: `local checks failed with exit code ${result.exitCode}`) +
					(skipped.length > 0 ? `; ${skipped.length} skipped-test line(s) reported` : ""),
				createdAt: deps.now(),
			});
			await saveState(deps, next, "mr_run_checks");
			const details = { ...stateSummary(next), command, outputPath, exitCode: result.exitCode, timedOut: result.timedOut, skipped };
			return textResult(JSON.stringify(details, null, 2), details);
		},
	);

	register(
		pi,
		"mr_transition",
		"Merge-ready transition",
		"Move the active run through its validated controller state machine.",
		schema(pi, { to: stringSchema, reason: stringSchema, gate: optional(unknownSchema) }),
		async (_id, rawParams, _signal, _onUpdate, ctx) => {
			requireMain(ctx, "mr_transition");
			const params = inputRecord(rawParams);
			const active = await activeRun(deps, ctx);
			if (!active.run) return textResult("No active merge-ready run.", { active: false });
			const to = stringValue(params.to);
			const reason = stringValue(params.reason);
			if (!to || !reason) throw new Error("mr_transition requires non-empty to and reason");
			const suppliedGate = params.gate && typeof params.gate === "object" ? (params.gate as GateResult) : undefined;
			let state = active.run;
			let gate = suppliedGate;
			if (to === "MERGE_READY") {
				const patch = await computePatchIdentity(active.ports.git, state.repo.baseBranch);
				state = applyPatchChange(state, patch, deps.now());
				state = await refreshEvidence(deps, state, active.ports);
				await saveState(deps, state, "mr_transition:refresh");
				gate = evaluateGate(state);
			}
			if (to === "BLOCKED_ENVIRONMENT" || to === "BLOCKED_EXTERNAL") {
				rejectLocalGiveUp(state, to, evaluateGate(state));
			}
			const next = transition(state, to as RunState["phase"], reason, deps.now(), gate);
			await saveState(deps, next, "mr_transition");
			return textResult(JSON.stringify(stateSummary(next), null, 2), stateSummary(next));
		},
	);

	register(
		pi,
		"mr_refresh",
		"Refresh merge-ready state",
		"Recompute local patch identity, refresh pull-request state, and invalidate stale evidence.",
		stateParams,
		async (_id, _params, _signal, _onUpdate, ctx) => {
			requireMain(ctx, "mr_refresh");
			const active = await activeRun(deps, ctx);
			if (!active.run) return textResult("No active merge-ready run.", { active: false });
			const patch = await computePatchIdentity(active.ports.git, active.run.repo.baseBranch);
			let next = applyPatchChange(active.run, patch, deps.now());
			next = await refreshEvidence(deps, next, active.ports);
			await saveState(deps, next, "mr_refresh");
			return textResult(JSON.stringify(stateSummary(next), null, 2), stateSummary(next));
		},
	);

	register(
		pi,
		"mr_review_packet",
		"Merge-ready review packet",
		"Freeze the current patch context for independent review and return its digest.",
		schema(pi, {
			contextPointers: optional(z.array(stringSchema)),
			rubricVersion: optional(stringSchema),
		}),
		async (_id, rawParams, _signal, _onUpdate, ctx) => {
			requireMain(ctx, "mr_review_packet");
			const params = inputRecord(rawParams);
			const active = await activeRun(deps, ctx);
			if (!active.run) return textResult("No active merge-ready run.", { active: false });
			if (!active.run.patch) throw new Error("cannot issue a review packet without a current patch identity");
			if (!active.ports.git.diff) throw new Error("git adapter cannot compute a review packet diff");
			const diff = await active.ports.git.diff(active.run.patch.baseSha, active.run.patch.headSha);
			if (diff.trim().length === 0) throw new Error("cannot issue a review packet for an empty diff");

			const runDir = join(deps.store.baseDir, "runs", active.run.runId);
			const frozenDiffPath = join(runDir, "review.diff");
			await mkdir(runDir, { recursive: true });
			await writeFile(frozenDiffPath, diff, "utf8");
			const packet = buildReviewPacket(active.run, {
				diffPath: frozenDiffPath,
				contextPointers: Array.isArray(params.contextPointers)
					? params.contextPointers.filter((item): item is string => typeof item === "string")
					: [],
				rubricVersion: stringValue(params.rubricVersion) ?? "merge-ready-v1",
			});
			const digest = packetDigest(packet);
			const issued = recordIssuedPacket(active.run, digest);
			await saveState(deps, issued, "mr_review_packet");
			const changedFiles = (diff.match(/^diff --git /gm) ?? []).length;
			const warnings =
				changedFiles > LARGE_DIFF_FILES
					? [`diff spans ${changedFiles} files against base ${active.run.repo.baseBranch}; if that base is wrong, call mr_contract set_base and mr_refresh before review`]
					: [];
			const details = { packet, digest, diffPath: frozenDiffPath, warnings };
			return textResult(JSON.stringify(details, null, 2), details);
		},
	);
}

export const registerMergeReadyTools = registerTools;